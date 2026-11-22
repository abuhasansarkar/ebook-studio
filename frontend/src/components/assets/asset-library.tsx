"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageOff, RefreshCw, Trash2, Upload, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, EmptyState, ErrorState, PageLoader, Progress } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { operationRequest } from "@/lib/operation-request";
import { useSession } from "@/lib/auth-client";
import { qk, useBooks } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";

export interface ImageAsset {
  id: string;
  provenance?: string;
  width: number;
  height: number;
  bytes: number;
  alt: string;
  caption: string;
  _count: { references: number };
}

export const imageUrl = (id: string) => `/api/v1/assets/${encodeURIComponent(id)}/content`;

/** The upload limits the product enforces. */
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

function AssetCard({
  asset,
  onInsert,
  onChanged,
}: {
  asset: ImageAsset;
  onInsert?: (asset: ImageAsset) => void;
  onChanged: () => void;
}) {
  const [alt, setAlt] = useState(asset.alt);
  const [caption, setCaption] = useState(asset.caption);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  const save = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.patch(`/assets/${asset.id}`, { alt, caption });
      onChanged();
      setMessage("Details saved. Existing chapter captions stay unchanged.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await api.delete(`/assets/${asset.id}`);
      setConfirmDelete(false);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="relative flex h-44 items-center justify-center bg-muted">
        {/* Authenticated private images must bypass the public image optimizer. */}
        {previewFailed ? (
          <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground" role="img" aria-label={alt || "Image preview unavailable"}>
            <ImageOff className="h-6 w-6" aria-hidden />
            Preview unavailable
            <button type="button" className="cursor-pointer font-medium text-primary hover:underline" onClick={() => setPreviewFailed(false)}>
              Try again
            </button>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl(asset.id)} alt={alt} loading="lazy" className="h-full w-full object-contain" onError={() => setPreviewFailed(true)} />
        )}
        {asset._count.references > 0 && (
          <span className="absolute end-2 top-2">
            <Badge tone="neutral" className="bg-white/90">
              In a manuscript
            </Badge>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-xs text-muted-foreground">
          {asset.provenance?.startsWith("ai:") ? "AI-generated · " : ""}
          {asset.width} × {asset.height} · {formatNumber(Math.round(asset.bytes / 1024))} KB ·{" "}
          {asset._count.references > 0 ? "Used in a manuscript" : "Not used in a manuscript yet"}
        </p>

        <Field label="Alternative text" htmlFor={`alt-${asset.id}`} hint="Describe the image, or leave it empty if it is decorative.">
          <Input
            id={`alt-${asset.id}`}
            value={alt}
            maxLength={500}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="A sliced loaf of sourdough on a floured board"
          />
        </Field>

        <Field label="Caption" htmlFor={`caption-${asset.id}`}>
          <Textarea
            id={`caption-${asset.id}`}
            value={caption}
            maxLength={1000}
            onChange={(e) => setCaption(e.target.value)}
            className="min-h-16"
          />
        </Field>

        {error && (
          <Alert tone="danger">
            {error}
          </Alert>
        )}
        {message && (
          <Alert tone="success">
            {message}
          </Alert>
        )}

        <div className="mt-auto flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void save()}>
            Save details
          </Button>
          {onInsert && (
            <Button size="sm" disabled={busy} onClick={() => onInsert({ ...asset, alt, caption })}>
              Insert image
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || asset._count.references > 0}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
        {asset._count.references > 0 && (
          <p className="text-xs text-muted-foreground">
            This image is used in a manuscript, so it is kept for revision history and cannot be deleted.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete this image?"
        description="The image is removed from your library."
        confirmLabel="Delete image"
        busy={busy}
      >
        <p>This cannot be undone. Any browser draft that has not been saved yet and still refers to this image will lose it.</p>
      </ConfirmDialog>
    </Card>
  );
}

export function AssetLibrary({ onInsert }: { onInsert?: (asset: ImageAsset) => void }) {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const upload = useRef<XMLHttpRequest | null>(null);
  // The last file that did not finish, so it can be sent again without choosing it twice.
  const [failedFile, setFailedFile] = useState<File | null>(null);

  useEffect(() => () => {
    upload.current?.abort();
  }, []);

  const query = useQuery({
    queryKey: ["assets", session?.user.id, cursor],
    enabled: !!session?.user.id,
    queryFn: () => api.get<{ assets: ImageAsset[]; nextCursor: string | null }>(`/assets${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["assets"] });
  };

  function send(file: File) {
    setError("");
    setFailedFile(null);
    if (!ACCEPTED.includes(file.type) || !file.size || file.size > MAX_BYTES) {
      setError("Choose a PNG, JPEG or WebP up to 10 MiB.");
      return;
    }
    const xhr = new XMLHttpRequest();
    upload.current = xhr;
    xhr.open("POST", "/api/v1/assets");
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.timeout = 90000;
    setProgress(0);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    const done = () => {
      setProgress(null);
      upload.current = null;
      if (input.current) input.current.value = "";
    };
    xhr.onload = () => {
      if (xhr.status === 201) {
        setCursor(null);
        refresh();
      } else {
        let message = "Upload failed. Please retry.";
        try {
          message = JSON.parse(xhr.responseText).error?.message ?? message;
        } catch {
          /* the response was not the expected shape */
        }
        setError(message);
        // A refusal (wrong type, too large) will not change on a retry; a
        // server fault might.
        if (xhr.status >= 500) setFailedFile(file);
      }
      done();
    };
    xhr.onerror = xhr.ontimeout = () => {
      setError("The upload could not be confirmed. The library has been refreshed; if the image is not there, retry.");
      setFailedFile(file);
      refresh();
      done();
    };
    xhr.onabort = () => {
      setError("Upload cancelled. Nothing was added to your library.");
      setFailedFile(file);
      done();
    };
    xhr.send(file);
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Upload an image</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Private PNG, JPEG or WebP images. Maximum 10 MiB, 24 megapixels and 10,000 pixels per side. Still images
          only. Upload images you have permission to publish.
        </p>

        <div className="mt-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-muted">
            <Upload className="h-4 w-4" />
            Choose an image
            <input
              ref={input}
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={progress !== null || !session}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) send(file);
              }}
            />
          </label>
        </div>

        {progress !== null && (
          <div className="mt-4 space-y-2" role="status">
            <Progress value={progress} />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {progress < 100 ? `Uploading ${progress}%` : "Validating and processing image…"}
              </p>
              {progress < 100 && (
                <Button size="sm" variant="ghost" onClick={() => upload.current?.abort()}>
                  Cancel upload
                </Button>
              )}
            </div>
          </div>
        )}

        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
            {failedFile && progress === null && (
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={() => send(failedFile)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Retry {failedFile.name}
                </Button>
              </div>
            )}
          </Alert>
        )}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Your images</h2>
        <Button variant="secondary" size="sm" onClick={refresh}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {query.isPending ? (
        <PageLoader label="Loading images…" />
      ) : query.error ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data && query.data.assets.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} onInsert={onInsert} onChanged={refresh} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!cursor} onClick={() => setCursor(null)}>
              First page
            </Button>
            <Button variant="secondary" disabled={!query.data.nextCursor} onClick={() => setCursor(query.data!.nextCursor)}>
              Next page
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          icon={<ImageOff className="h-6 w-6" />}
          title="No images yet"
          description="Upload a PNG, JPEG or WebP to use in your books. Images stay private to your account."
        />
      )}
    </div>
  );
}

export function ImageStudio() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 space-y-6">
      <PageHeader
        title="Cover & Illustration Studio"
        description="Generate AI illustrations, design custom covers, or upload media for your eBook and Coloring Book manuscripts."
      />
      <AiIllustrationGenerator onGenerated={() => void qc.invalidateQueries({ queryKey: ["assets"] })} />
      <AssetLibrary key={session?.user.id ?? "loading"} />
    </div>
  );
}

function AiIllustrationGenerator({ onGenerated }: { onGenerated: () => void }) {
  const qc = useQueryClient();
  const [bookId, setBookId] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [purpose, setPurpose] = useState<"illustration" | "cover">("illustration");
  const [aspect, setAspect] = useState<"portrait" | "square" | "landscape">("square");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const booksQuery = useBooks();

  const config = useQuery({
    queryKey: ["image-config"],
    queryFn: () => api.get<{ credits: number; model: string; mock: boolean; enabled: boolean }>("/image-config"),
  });

  const books = booksQuery.data ?? [];

  useEffect(() => {
    if (!bookId && books.length > 0) {
      setBookId(books[0].id);
    }
  }, [bookId, books]);

  const activeJobsQuery = useQuery({
    queryKey: ["image-jobs", bookId],
    queryFn: () => api.get<{ jobs: { id: string; status: string; assetId?: string; error?: string }[] }>(`/books/${bookId}/images`),
    enabled: Boolean(bookId),
    refetchInterval: (q) => q.state.data?.jobs.some((j) => ["queued", "running"].includes(j.status)) ? 1500 : false,
  });

  const activeJob = activeJobsQuery.data?.jobs.find((j) => ["queued", "running"].includes(j.status));

  useEffect(() => {
    const latest = activeJobsQuery.data?.jobs[0];
    if (latest && latest.status === "completed" && latest.assetId) {
      void qc.invalidateQueries({ queryKey: ["assets"] });
      void qc.invalidateQueries({ queryKey: qk.credits });
      onGenerated();
    }
  }, [activeJobsQuery.data, onGenerated, qc]);

  const handleGenerate = async () => {
    if (!bookId) {
      setError("Please select or create an eBook to associate the generated illustration with.");
      return;
    }
    if (prompt.trim().length < 10) {
      setError("Prompt must be at least 10 characters long.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccessMsg("");
    try {
      await operationRequest(`/books/${bookId}/images`, {
        purpose,
        prompt: prompt.trim(),
        aspect,
        expectedCredits: config.data?.credits ?? 10,
      });
      setSuccessMsg("AI image generation job queued! Generating illustration in background…");
      setPrompt("");
      await activeJobsQuery.refetch();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6 border-brand-200/50 bg-gradient-to-br from-card to-brand-50/20">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-5 w-5 text-brand-600" />
        <h3 className="font-semibold text-base">Generate AI Illustration</h3>
        {config.data && (
          <Badge tone="neutral" className="ml-auto text-xs">
            {config.data.credits} credits per image
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Generate custom interior scene illustrations, decorative elements, or cover concepts using AI. Generated images are automatically saved to your private asset library.
      </p>

      {config.data && !config.data.enabled && (
        <Alert tone="warning" className="mb-4">
          Image generation is currently disabled or not configured in system settings.
        </Alert>
      )}

      {books.length === 0 && !booksQuery.isPending && (
        <Alert tone="info" className="mb-4">
          You don&apos;t have any books yet. Create your first eBook or Coloring Book project to generate AI illustrations for it.
        </Alert>
      )}

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Target Book" htmlFor="illustration-book">
            <Select
              id="illustration-book"
              value={bookId}
              onChange={(e) => setBookId(e.target.value)}
              disabled={books.length === 0 || busy || Boolean(activeJob)}
            >
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Purpose" htmlFor="illustration-purpose">
            <Select
              id="illustration-purpose"
              value={purpose}
              onChange={(e) => {
                const p = e.target.value as "illustration" | "cover";
                setPurpose(p);
                if (p === "cover") setAspect("portrait");
              }}
              disabled={busy || Boolean(activeJob)}
            >
              <option value="illustration">Interior Illustration</option>
              <option value="cover">Cover Concept</option>
            </Select>
          </Field>

          <Field label="Aspect Ratio" htmlFor="illustration-aspect">
            <Select
              id="illustration-aspect"
              value={aspect}
              onChange={(e) => setAspect(e.target.value as "square" | "portrait" | "landscape")}
              disabled={purpose === "cover" || busy || Boolean(activeJob)}
            >
              <option value="square">Square (1:1)</option>
              <option value="portrait">Portrait (2:3)</option>
              <option value="landscape">Landscape (3:2)</option>
            </Select>
          </Field>
        </div>

        <Field
          label="Illustration Prompt"
          htmlFor="illustration-prompt"
          hint="Describe the scene, subject, lighting, style, and mood in detail (10-2000 chars)."
        >
          <Textarea
            id="illustration-prompt"
            placeholder="e.g. A serene cozy reading nook with sun rays streaming through a bay window, potted ferns, and a sleeping orange tabby cat..."
            className="min-h-20"
            minLength={10}
            maxLength={2000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={busy || Boolean(activeJob)}
          />
        </Field>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              disabled={
                busy ||
                Boolean(activeJob) ||
                !bookId ||
                prompt.trim().length < 10 ||
                !config.data?.enabled
              }
              onClick={handleGenerate}
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              {activeJob
                ? "Generating in background…"
                : busy
                ? "Submitting…"
                : `Generate Illustration (${config.data?.credits ?? 10} credits)`}
            </Button>
            {prompt.trim().length > 0 && prompt.trim().length < 10 && (
              <span className="text-xs text-muted-foreground">
                Minimum 10 characters ({prompt.trim().length}/10)
              </span>
            )}
          </div>
          {activeJob && (
            <div className="flex items-center gap-2 text-sm text-brand-600 animate-pulse">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Generating illustration… status: {activeJob.status}</span>
            </div>
          )}
        </div>

        {error && <Alert tone="danger">{error}</Alert>}
        {successMsg && !error && <Alert tone="success">{successMsg}</Alert>}
      </div>
    </Card>
  );
}
