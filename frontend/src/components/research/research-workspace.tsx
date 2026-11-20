"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileText,
  Link2,
  Loader2,
  MessageSquare,
  Quote,
  Trash2,
  Upload,
} from "lucide-react";
import { CITATION_STATE_LABELS, SOURCE_FORMAT_LABELS, type SourceFormat } from "@ebook/shared";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useBook } from "@/lib/queries";
import { formatBytes, timeAgo } from "@/lib/utils";
import {
  fetchPassage,
  useApplyImport,
  useChapterCitations,
  useDeleteSource,
  useLinkSource,
  useSourceLinks,
  useSourcePassages,
  useSourcePreview,
  useSourceQuestion,
  useSources,
  useSourceSummary,
  useUploadSource,
  type SourceRow,
} from "@/lib/sources";

/**
 * The research workspace.
 *
 * A source is imported, extracted and then reviewed. Nothing reaches the
 * manuscript until the author confirms the preview, and a source that is
 * applied twice never duplicates the chapters. Questions are answered from the
 * author's own sources; when the sources do not support an answer, the workspace
 * says so instead of inventing one.
 */

const FORMAT_ACCEPT: Record<SourceFormat, string> = {
  notes: ".txt,.md,.markdown,text/plain,text/markdown",
  docx: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: ".pdf,application/pdf",
};

const FORMAT_HINT: Record<SourceFormat, string> = {
  notes: "Plain text or Markdown. Headings become separate chapters.",
  docx: "A Word document. Only the text is read; macros and links are never run.",
  pdf: "A PDF with a text layer. Scanned pages have no text to read and are reported.",
};

const MAX_BYTES = 5 * 1024 * 1024;

export function ResearchWorkspace({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const book = useBook(bookId);
  const sources = useSources(bookId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openPassage, setOpenPassage] = useState<{ sourceId: string; locator: string } | null>(null);
  const selected = sources.data?.find((s) => s.id === selectedId) ?? sources.data?.[0] ?? null;

  if (book.isLoading || sources.isLoading) return <PageLoader label="Loading your research sources…" />;
  if (sources.error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
        <ErrorState message={errorMessage(sources.error)} onRetry={() => void sources.refetch()} />
      </div>
    );
  }

  const ready = sources.data?.filter((s) => s.status === "ready") ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8">
      <div className="max-w-3xl">
        <h2 className="text-xl font-semibold">Research</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Import your own notes and documents. They stay private to this book. Imported text is never written into
          your manuscript until you review the preview and confirm it, and a source can only be imported once per version.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-4">
          <ImportPanel bookId={bookId} onImported={(id) => setSelectedId(id)} />
          <SourceList
            sources={sources.data ?? []}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
        </div>

        <div className="space-y-6">
          {selected ? (
            <SourceDetail key={selected.id} bookId={bookId} source={selected} chapters={book.data?.chapters ?? []} />
          ) : (
            <EmptyState
              icon={<BookOpen className="h-6 w-6" />}
              title="No source imported yet"
              description="Import a note, a Word document or a text PDF to use it as evidence for this book."
            />
          )}
          {ready.length > 0 && (
            <ResearchPanel bookId={bookId} sources={ready} onOpenPassage={setOpenPassage} />
          )}
          <ChapterCitationsPanel
            bookId={bookId}
            chapters={book.data?.chapters ?? []}
            onOpenPassage={setOpenPassage}
          />
        </div>
      </div>
      {openPassage && (
        <PassageDialog key={`${openPassage.sourceId}-${openPassage.locator}`} {...openPassage} onClose={() => setOpenPassage(null)} />
      )}
    </div>
  );
}

/** The upload form. The file itself is the request body. */
function ImportPanel({ bookId, onImported }: { bookId: string; onImported: (id: string) => void }) {
  const upload = useUploadSource(bookId);
  const [format, setFormat] = useState<SourceFormat>("notes");
  const [title, setTitle] = useState("");
  const [provenance, setProvenance] = useState("");
  const [license, setLicense] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!file) {
      setError("Choose a file to import.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_BYTES)}.`);
      return;
    }
    setError("");
    try {
      const result = await upload.mutateAsync({
        file,
        title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
        format,
        provenance: provenance.trim(),
        license: license.trim(),
      });
      toast.success(`Imported "${result.source.title}".`);
      setTitle("");
      setProvenance("");
      setLicense("");
      setFile(null);
      onImported(result.source.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Import a source</h3>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <Label htmlFor="source-format">Format</Label>
          <Select id="source-format" value={format} onChange={(e) => setFormat(e.target.value as SourceFormat)}>
            {(Object.keys(SOURCE_FORMAT_LABELS) as SourceFormat[]).map((f) => (
              <option key={f} value={f}>
                {SOURCE_FORMAT_LABELS[f]}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">{FORMAT_HINT[format]}</p>
        </div>

        <div>
          <Label htmlFor="source-file">File</Label>
          <input
            id="source-file"
            type="file"
            accept={FORMAT_ACCEPT[format]}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted-foreground file:me-3 file:rounded-xl file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground hover:file:bg-muted"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Up to {formatBytes(MAX_BYTES)}. The file is stored privately and read for text only.
          </p>
        </div>

        <div>
          <Label htmlFor="source-title">Title</Label>
          <Input
            id="source-title"
            value={title}
            maxLength={200}
            placeholder="The file name is used if you leave this empty"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="source-provenance">Where it came from</Label>
            <Input
              id="source-provenance"
              value={provenance}
              maxLength={500}
              placeholder="Your own notes, 2024"
              onChange={(e) => setProvenance(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="source-license">Permission</Label>
            <Input
              id="source-license"
              value={license}
              maxLength={500}
              placeholder="Yours to use"
              onChange={(e) => setLicense(e.target.value)}
            />
          </div>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <Button className="w-full" loading={upload.isPending} onClick={() => void submit()}>
          Import source
        </Button>
      </div>
    </Card>
  );
}

/** The sources of this book. */
function SourceList({
  sources,
  selectedId,
  onSelect,
}: {
  sources: SourceRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!sources.length) return null;
  return (
    <Card className="divide-y divide-border">
      <div className="px-5 py-3">
        <h3 className="text-sm font-semibold">Your sources</h3>
      </div>
      {sources.map((s) => (
        <button
          key={s.id}
          type="button"
          data-source={s.id}
          aria-pressed={s.id === selectedId}
          onClick={() => onSelect(s.id)}
          className={`flex w-full items-start gap-3 px-5 py-3 text-left transition-colors ${
            s.id === selectedId ? "bg-primary-soft/40" : "hover:bg-muted"
          }`}
        >
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{s.title}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge tone={statusTone(s.status)}>{statusLabel(s.status)}</Badge>
              <span>{SOURCE_FORMAT_LABELS[s.format]}</span>
              {s._count.links > 0 && <span>· {s._count.links} chapter{s._count.links === 1 ? "" : "s"}</span>}
            </span>
          </span>
        </button>
      ))}
    </Card>
  );
}

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" {
  if (status === "ready") return "success";
  if (status === "empty" || status === "scanned") return "warning";
  if (status === "failed") return "danger";
  return "neutral";
}

function statusLabel(status: string): string {
  if (status === "ready") return "Ready";
  if (status === "empty") return "No text";
  if (status === "scanned") return "Scanned";
  if (status === "failed") return "Failed";
  return "Extracting";
}

/** One source: its extraction, its preview and the chapters it supports. */
function SourceDetail({
  bookId,
  source,
  chapters,
}: {
  bookId: string;
  source: SourceRow;
  chapters: { id: string; title: string; position: number }[];
}) {
  const [showPreview, setShowPreview] = useState(false);
  const remove = useDeleteSource(bookId);
  const links = useSourceLinks(source.id);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold">{source.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge tone={statusTone(source.status)}>{statusLabel(source.status)}</Badge>
            <span>{SOURCE_FORMAT_LABELS[source.format]}</span>
            <span>· {formatBytes(source.bytes)}</span>
            {source.version > 0 && <span>· version {source.version}</span>}
            <span>· {timeAgo(source.createdAt)}</span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Delete source ${source.title}`}
          onClick={() => {
            // The chapters are kept, but the citations that rested on this
            // source are now reported as pointing at text that is gone.
            if (!confirm(`Remove "${source.title}"? The chapters it supported are kept, but the citations that point at it will be reported as changed.`)) return;
            remove.mutate(source.id, {
              onSuccess: () => toast.success("Source removed."),
              onError: (e) => toast.error(errorMessage(e)),
            });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </Button>
      </div>

      {source.provenance && <p className="mt-3 text-sm text-muted-foreground">From: {source.provenance}</p>}
      {source.license && <p className="mt-1 text-sm text-muted-foreground">Permission: {source.license}</p>}
      {source.error && (
        <Alert tone="warning" className="mt-3">
          {source.error}
        </Alert>
      )}

      {source.status === "ready" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? "Hide preview" : "Review import preview"}
          </Button>
          <span className="text-xs text-muted-foreground">Nothing is written until you confirm.</span>
        </div>
      )}

      {showPreview && source.status === "ready" && <ImportPreview source={source} bookId={bookId} />}

      {!!links.data?.length && (
        <div className="mt-5 border-t border-border pt-4">
          <h4 className="text-sm font-semibold">Supports</h4>
          <ul className="mt-2 space-y-1.5">
            {links.data.map((l) => (
              <li key={l.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                <Link href={`/app/books/${bookId}/editor?chapter=${l.chapter.id}`} className="underline">
                  {l.chapter.title}
                </Link>
                {l.locators.length > 0 && <span className="text-xs">· {l.locators.length} passage(s)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {source.status === "ready" && (
        <LinkToChapter source={source} chapters={chapters} bookId={bookId} />
      )}
    </Card>
  );
}

/**
 * Links a source to an existing chapter.
 *
 * The link records which passages support the chapter, so a citation later
 * points at the exact text that was read.
 */
function LinkToChapter({
  source,
  chapters,
  bookId,
}: {
  source: SourceRow;
  chapters: { id: string; title: string; position: number }[];
  bookId: string;
}) {
  const link = useLinkSource(source.id, bookId);
  const passages = useSourcePassages(source.id);
  const [chapterId, setChapterId] = useState("");
  const [locators, setLocators] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  if (!chapters.length) return null;

  const submit = async () => {
    setError("");
    try {
      await link.mutateAsync({ chapterId, locators, note: note.trim() });
      toast.success("Source linked to the chapter.");
      setChapterId("");
      setLocators([]);
      setNote("");
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!open) {
    return (
      <Button variant="secondary" size="sm" className="mt-4" onClick={() => setOpen(true)}>
        <Link2 className="h-3.5 w-3.5" /> Link to an existing chapter
      </Button>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border p-4" data-link-panel>
      <div>
        <Label htmlFor="link-chapter">Chapter</Label>
        <Select id="link-chapter" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
          <option value="">Choose a chapter…</option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.position + 1}. {c.title}
            </option>
          ))}
        </Select>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Supporting passages</legend>
        <p className="mb-1.5 text-xs text-muted-foreground">
          Pick the passages that support this chapter. A citation opens exactly this text.
        </p>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {(passages.data ?? []).map((p) => (
            <label key={p.locator} className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 accent-primary"
                checked={locators.includes(p.locator)}
                onChange={(e) =>
                  setLocators((l) => (e.target.checked ? [...l, p.locator] : l.filter((x) => x !== p.locator)))
                }
              />
              <span>
                <span className="font-medium">{p.locator}</span>
                <span className="block text-muted-foreground">{p.text.slice(0, 120)}</span>
              </span>
            </label>
          ))}
          {!passages.data?.length && <p className="text-xs text-muted-foreground">No passages extracted.</p>}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="link-note">Note</Label>
        <Input
          id="link-note"
          value={note}
          maxLength={1000}
          placeholder="How this source relates to the chapter"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex gap-2">
        <Button size="sm" loading={link.isPending} disabled={!chapterId} onClick={() => void submit()}>
          Link source
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The proposed chapter mapping, and the confirmation that applies it. */
function ImportPreview({ source, bookId }: { source: SourceRow; bookId: string }) {
  const preview = useSourcePreview(source.id);
  const apply = useApplyImport(source.id, bookId);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [applied, setApplied] = useState<{ count: number } | null>(null);

  if (preview.isLoading) return <PageLoader label="Reading the source…" />;
  if (preview.error) return <ErrorState message={errorMessage(preview.error)} onRetry={() => void preview.refetch()} />;
  if (!preview.data) return null;

  const { proposals, passages, version, warnings, appliedAt } = preview.data;
  const textByLocator = new Map(passages.map((p) => [p.locator, p.text]));

  const selectedProposals = proposals.filter((_, i) => chosen[i] !== false);
  const allSelected = selectedProposals.length === proposals.length;
  const alreadyApplied = Boolean(appliedAt);

  const confirm = async () => {
    setError("");
    try {
      const result = await apply.mutateAsync({
        version,
        chapters: selectedProposals.map((p) => ({ title: p.title, locators: p.locators })),
        appendToChapterIds: [],
      });
      const count = result.created.length + result.appended.length;
      setApplied({ count });
      toast.success(
        result.alreadyApplied || count === 0
          ? "This version was already applied; nothing was changed."
          : `Imported ${count} chapter${count === 1 ? "" : "s"} into your manuscript.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!proposals.length) {
    return (
      <Alert tone="warning" className="mt-4">
        This source has no text to import.
      </Alert>
    );
  }

  return (
    <div className="mt-4 space-y-3" data-preview>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">
          Preview · version {version} · {proposals.length} proposed chapter{proposals.length === 1 ? "" : "s"}
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setChosen(allSelected ? Object.fromEntries(proposals.map((_, i) => [i, false])) : {})}
        >
          {allSelected ? "Select none" : "Select all"}
        </Button>
      </div>

      {alreadyApplied && (
        <div data-applied="true">
          <Alert tone="success">
            This version was already imported into your manuscript. Confirming again changes nothing.
          </Alert>
        </div>
      )}
      {applied && !alreadyApplied && (
        <div data-applied="true">
          <Alert tone="success">
            Imported {applied.count} chapter{applied.count === 1 ? "" : "s"} into your manuscript.
          </Alert>
        </div>
      )}
      {warnings.length > 0 && (
        <Alert tone="warning">
          {warnings.map((w) => w.message).join(" ")}
        </Alert>
      )}

      <ul className="space-y-2">
        {proposals.map((p, i) => (
          <li key={`${p.title}-${i}`} className="rounded-xl border border-border p-3">
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={chosen[i] !== false}
                onChange={(e) => setChosen((c) => ({ ...c, [i]: e.target.checked }))}
              />
              <span className="min-w-0">
                <span className="block font-medium">{p.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {p.locators.length} passage{p.locators.length === 1 ? "" : "s"}
                </span>
                <span className="mt-1.5 block text-xs text-muted-foreground">
                  {p.locators
                    .slice(0, 2)
                    .map((l) => textByLocator.get(l) ?? "")
                    .filter(Boolean)
                    .join(" … ")
                    .slice(0, 240)}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {error && <Alert tone="danger">{error}</Alert>}

      <Button
        loading={apply.isPending}
        disabled={selectedProposals.length === 0}
        onClick={() => void confirm()}
      >
        Confirm import into manuscript
      </Button>
      <p className="text-xs text-muted-foreground">
        Confirming once imports these chapters. Confirming again does not duplicate them.
      </p>
    </div>
  );
}

/** Questions and summaries answered from the book's own sources. */
function ResearchPanel({
  bookId,
  sources,
  onOpenPassage,
}: {
  bookId: string;
  sources: SourceRow[];
  onOpenPassage: (p: { sourceId: string; locator: string }) => void;
}) {
  const [question, setQuestion] = useState("");
  const [useAll, setUseAll] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);
  const ask = useSourceQuestion(bookId);
  const summarize = useSourceSummary(bookId);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const ids = useAll ? sources.map((s) => s.id) : chosen;

  const submit = async () => {
    if (question.trim().length < 3) {
      toast.error("Ask a question first.");
      return;
    }
    try {
      await ask.mutateAsync({ question: question.trim(), sourceIds: ids });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Ask your sources</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Answers come only from the passages below. When the sources do not support an answer, the answer says so
        instead of inventing one.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <Label htmlFor="research-question">Question</Label>
          <Textarea
            id="research-question"
            value={question}
            maxLength={1000}
            placeholder="What do my sources say about storing cooked food safely?"
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Sources to use</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={useAll}
              onChange={(e) => setUseAll(e.target.checked)}
            />
            All {sources.length} ready source{sources.length === 1 ? "" : "s"}
          </label>
          {!useAll &&
            sources.map((s) => (
              <label key={s.id} className="flex items-center gap-2 ps-6 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={chosen.includes(s.id)}
                  onChange={(e) =>
                    setChosen((c) => (e.target.checked ? [...c, s.id] : c.filter((id) => id !== s.id)))
                  }
                />
                {s.title}
              </label>
            ))}
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <Button loading={ask.isPending} disabled={!useAll && chosen.length === 0} onClick={() => void submit()}>
            Ask
          </Button>
          <Button
            variant="secondary"
            loading={summarize.isPending}
            disabled={!useAll && chosen.length === 0}
            onClick={() => {
              setSummaryOpen(true);
              summarize.mutate(
                { sourceIds: ids },
                { onError: (e) => toast.error(errorMessage(e)) },
              );
            }}
          >
            Summarize sources
          </Button>
        </div>
      </div>

      {ask.data && (
        <AnswerBlock
          outcome={ask.data.answer.outcome}
          text={ask.data.answer.answer}
          reason={ask.data.answer.reason}
          evidence={ask.data.answer.evidence}
          onOpenPassage={onOpenPassage}
        />
      )}
      {summaryOpen && summarize.data && (
        <AnswerBlock
          outcome={summarize.data.summary.outcome}
          text={summarize.data.summary.summary}
          reason={summarize.data.summary.reason}
          evidence={summarize.data.summary.evidence}
          onOpenPassage={onOpenPassage}
        />
      )}
    </Card>
  );
}

/**
 * The citations of a chapter.
 *
 * A citation names the source and the passages it rests on. A citation whose
 * source was re-imported afterwards is flagged, because the text it referred to
 * is no longer the text that is stored.
 */
function ChapterCitationsPanel({
  bookId,
  chapters,
  onOpenPassage,
}: {
  bookId: string;
  chapters: { id: string; title: string; position: number }[];
  onOpenPassage: (p: { sourceId: string; locator: string }) => void;
}) {
  const [chapterId, setChapterId] = useState("");
  const citations = useChapterCitations(chapterId || null);

  if (!chapters.length) return null;

  return (
    <Card className="p-5">
      <h3 className="font-semibold">Chapter citations</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        See which of your sources back a chapter, and open the exact passage a citation rests on.
      </p>
      <div className="mt-3">
        <Label htmlFor="citation-chapter">Chapter</Label>
        <Select id="citation-chapter" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
          <option value="">Choose a chapter…</option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.position + 1}. {c.title}
            </option>
          ))}
        </Select>
      </div>

      {chapterId && citations.isLoading && <PageLoader label="Loading citations…" />}
      {chapterId && citations.error && <Alert tone="danger" className="mt-3">{errorMessage(citations.error)}</Alert>}
      {chapterId && citations.data && (
        <div className="mt-4 space-y-3" data-citations>
          {citations.data.citations.length === 0 ? (
            <p className="text-sm text-muted-foreground">This chapter has no sources yet.</p>
          ) : (
            citations.data.citations.map((c) => (
              <div key={c.id} className="rounded-xl border border-border p-3 text-sm" data-citation-state={c.state}>
                <div className="flex flex-wrap items-center gap-2">
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <Link href={`/app/books/${bookId}/research`} className="font-medium underline">
                    {c.sourceTitle}
                  </Link>
                  {c.state !== "current" && <Badge tone="warning">{CITATION_STATE_LABELS[c.state]}</Badge>}
                </div>
                {c.note && <p className="mt-1 text-xs text-muted-foreground">{c.note}</p>}
                {c.reason && <p className="mt-1 text-xs text-muted-foreground">{c.reason}</p>}
                {c.locators.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.locators.map((l) => (
                      <button
                        key={l}
                        type="button"
                        className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
                        onClick={() => onOpenPassage({ sourceId: c.sourceId, locator: l })}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

/** An answer or a summary, with the passages it came from. */
function AnswerBlock({
  outcome,
  text,
  reason,
  evidence,
  onOpenPassage,
}: {
  outcome: string;
  text: string;
  reason: string;
  evidence: { locator: string; sourceId: string; sourceTitle: string; page: number | null; text: string }[];
  onOpenPassage: (p: { sourceId: string; locator: string }) => void;
}) {
  const supported = outcome === "supported" || outcome === "summary";
  return (
    <div className="mt-5 space-y-3" data-answer={outcome}>
      <Alert tone={supported ? "success" : "warning"}>
        {supported ? (
          <span className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{text}</span>
          </span>
        ) : (
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>The sources do not answer this.</strong> {reason}
            </span>
          </span>
        )}
      </Alert>

      {evidence.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">Evidence · {evidence.length} passage(s)</h4>
          <ul className="mt-2 space-y-2">
            {evidence.map((e) => (
              <li key={`${e.sourceId}-${e.locator}`} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Quote className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{e.sourceTitle}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.locator}
                    {e.page ? ` · page ${e.page}` : ""}
                  </span>
                  <button
                    type="button"
                    className="ms-auto text-xs font-semibold text-primary-hover underline"
                    onClick={() => onOpenPassage({ sourceId: e.sourceId, locator: e.locator })}
                  >
                    Open passage
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{e.text.slice(0, 400)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The real passage behind a citation. */
function PassageDialog({ sourceId, locator, onClose }: { sourceId: string; locator: string; onClose: () => void }) {
  const [passage, setPassage] = useState<{ source: { id: string; title: string }; version: number; passage: { locator: string; page: number | null; text: string } } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchPassage(sourceId, locator)
      .then((p) => {
        if (active) setPassage(p);
      })
      .catch((e: unknown) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [sourceId, locator]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cited passage"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        {error ? (
          <ErrorState message={error} />
        ) : !passage ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening the passage…
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{passage.source.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {passage.passage.locator}
                  {passage.passage.page ? ` · page ${passage.passage.page}` : ""} · version {passage.version}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{passage.passage.text}</p>
          </>
        )}
      </div>
    </div>
  );
}
