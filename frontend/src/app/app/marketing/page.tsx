"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Image as ImageIcon,
  Megaphone,
  PenLine,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { MarketingDraft, MarketingGraphic, MarketingOutputType, MarketingTone } from "@ebook/shared";
import { PageHeader } from "@/components/app/app-shell";
import { Alert, Badge, Card, EmptyState, ErrorState, PageLoader, Section } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { errorMessage } from "@/lib/api";
import {
  useCreateMarketingDraft,
  useCreateMarketingGraphic,
  useCreateMarketingSample,
  useMarketingDrafts,
  useMarketingGraphic,
  useMarketingGraphics,
  useMarketingOutputs,
  useMarketingSamples,
  useRegenerateMarketingDraft,
  useSaveMarketingDraft,
} from "@/lib/studio-queries";
import { useChapters } from "@/lib/queries";
import { formatNumber, timeAgo } from "@/lib/utils";

/** The rendered promotional graphic, for the gallery and the detail dialog. */
const graphicUrl = (id: string) => `/api/v1/marketing/graphics/${encodeURIComponent(id)}/download`;
const graphicDownloadUrl = graphicUrl;

/**
 * S15 — the marketing studio.
 *
 * The studio writes launch material for one book. Everything it produces is a
 * download the author sends themselves: nothing here emails a list, posts to a
 * social network or publishes to a store. The screens say so, so the boundary
 * is visible rather than assumed.
 *
 * Each draft keeps the chapter versions it was written from. When the
 * manuscript moves on, the draft is marked stale instead of quietly drifting
 * out of date.
 */

const TONES: { value: MarketingTone; label: string }[] = [
  { value: "clear", label: "Clear" },
  { value: "warm", label: "Warm" },
  { value: "bold", label: "Bold" },
  { value: "technical", label: "Technical" },
  { value: "playful", label: "Playful" },
];

const TEMPLATES: { value: "square_quote" | "square_cover" | "story_announcement" | "wide_banner"; label: string; size: string }[] = [
  { value: "square_quote", label: "Square quote", size: "1080 × 1080" },
  { value: "square_cover", label: "Square cover", size: "1080 × 1080" },
  { value: "story_announcement", label: "Story announcement", size: "1080 × 1920" },
  { value: "wide_banner", label: "Wide banner", size: "1200 × 628" },
];

const DRAFT_TONE: Record<MarketingDraft["status"], "neutral" | "primary" | "success"> = {
  draft: "neutral",
  edited: "primary",
  approved: "success",
};

/** Downloads a piece of text as a file. */
function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** One draft, with its flags and the editor. */
function DraftCard({
  draft,
  onSave,
  onRegenerate,
  saving,
}: {
  draft: MarketingDraft;
  onSave: (content: string, approve: boolean) => void;
  onRegenerate: () => void;
  saving: boolean;
}) {
  const [content, setContent] = useState(draft.content);
  const [dirty, setDirty] = useState(false);
  const [loadedId, setLoadedId] = useState(draft.id);
  const [loadedContent, setLoadedContent] = useState(draft.content);

  // A refetched draft replaces the editor content, but only while the author
  // has not started typing. Adjusting the state during render (rather than in
  // an effect) keeps the editor in step with the draft it is showing without
  // a second render pass.
  if (draft.id !== loadedId) {
    setLoadedId(draft.id);
    setLoadedContent(draft.content);
    setContent(draft.content);
    setDirty(false);
  } else if (!dirty && draft.content !== loadedContent) {
    setLoadedContent(draft.content);
    setContent(draft.content);
  }

  const flagCount = draft.flags.length;

  return (
    <Card className="p-5" data-testid={`marketing-draft-${draft.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold capitalize">{draft.outputType.replace(/_/g, " ")}</h3>
            <Badge tone={DRAFT_TONE[draft.status]}>{draft.status}</Badge>
            {draft.stale && <Badge tone="warning">Manuscript changed</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {draft.tone} tone · {draft.creditsCharged} credits · updated {timeAgo(draft.updatedAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onRegenerate} data-testid="regenerate-draft">
            <RefreshCw className="h-4 w-4" />
            New version
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadText(`${draft.outputType}.txt`, content)}
            data-testid="download-draft"
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
        </div>
      </div>

      {flagCount > 0 && (
        <div className="mt-4 space-y-2" data-testid="marketing-flags">
          {draft.flags.map((flag) => (
            <div
              key={flag.id}
              className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p className="font-medium capitalize">{flag.kind.replace(/_/g, " ")}</p>
                <p className="mt-0.5 text-muted-foreground">{flag.message}</p>
                {flag.excerpt && (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">“{flag.excerpt}”</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Textarea
        className="mt-4 min-h-[200px] bg-background p-4"
        value={content}
        aria-label={`Edit ${draft.outputType.replace(/_/g, " ")}`}
        onChange={(event) => {
          setContent(event.target.value);
          setDirty(true);
        }}
        data-testid="marketing-draft-editor"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!dirty}
          loading={saving}
          onClick={() => onSave(content, false)}
          data-testid="save-draft"
        >
          <PenLine className="h-4 w-4" />
          Save changes
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!dirty && draft.status === "approved"}
          loading={saving}
          onClick={() => onSave(content, true)}
          data-testid="approve-draft"
        >
          <CheckCircle2 className="h-4 w-4" />
          {draft.status === "approved" ? "Approved" : "Save and approve"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(content);
          }}
          data-testid="copy-draft"
        >
          <Copy className="h-4 w-4" />
          Copy
        </Button>
      </div>
    </Card>
  );
}

/** The graphic composer and the graphics it produced. */
function GraphicStudio({ bookId }: { bookId: string }) {
  const graphics = useMarketingGraphics(bookId);
  const create = useCreateMarketingGraphic(bookId);

  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]["value"]>("square_quote");
  const [headline, setHeadline] = useState("");
  const [subhead, setSubhead] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [useCover, setUseCover] = useState(true);
  const [openGraphicId, setOpenGraphic] = useState<string | null>(null);

  const submit = () => {
    create.mutate(
      {
        template,
        headline,
        subhead: subhead || undefined,
        callToAction: callToAction || undefined,
        useCover,
      },
      {
        onSuccess: () => {
          setHeadline("");
          setSubhead("");
          setCallToAction("");
        },
      },
    );
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Promotional graphics</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Each graphic is a downloadable image. Nothing is posted anywhere.
          </p>
        </div>
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Template" htmlFor="graphic-template">
          <Select
            id="graphic-template"
            value={template}
            onChange={(event) => setTemplate(event.target.value as typeof template)}
            data-testid="graphic-template"
          >
            {TEMPLATES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.size})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Headline" htmlFor="graphic-headline">
          <Input
            id="graphic-headline"
            value={headline}
            maxLength={200}
            placeholder="The book that changes how you cook"
            onChange={(event) => setHeadline(event.target.value)}
            data-testid="graphic-headline"
          />
        </Field>
        <Field label="Supporting line" htmlFor="graphic-subhead">
          <Input
            id="graphic-subhead"
            value={subhead}
            maxLength={300}
            placeholder="A practical guide for the home kitchen"
            onChange={(event) => setSubhead(event.target.value)}
          />
        </Field>
        <Field label="Call to action" htmlFor="graphic-cta">
          <Input
            id="graphic-cta"
            value={callToAction}
            maxLength={120}
            placeholder="Read the first chapter free"
            onChange={(event) => setCallToAction(event.target.value)}
          />
        </Field>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={useCover} onChange={(event) => setUseCover(event.target.checked)} />
        Use the book&apos;s cover as the background
      </label>

      <Button
        className="mt-4"
        loading={create.isPending}
        disabled={!headline.trim()}
        onClick={submit}
        data-testid="create-graphic"
      >
        <Sparkles className="h-4 w-4" />
        Create graphic
      </Button>

      {graphics.data && graphics.data.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {graphics.data.map((graphic: MarketingGraphic) => (
            <div key={graphic.id} className="overflow-hidden rounded-xl border border-border" data-testid="marketing-graphic">
              {graphic.ready ? (
                <img
                  src={graphicUrl(graphic.id)}
                  alt={`Promotional graphic: ${graphic.headline}`}
                  className="aspect-[4/3] w-full bg-muted object-contain"
                />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                  This graphic is still being rendered.
                </div>
              )}
              <div className="p-3">
                <p className="text-xs font-medium">{graphic.template.replace(/_/g, " ")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {graphic.width} × {graphic.height} · {graphic.usedCover ? "with cover" : "plain background"}
                </p>
                <p className="mt-2 line-clamp-2 text-sm">{graphic.headline}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setOpenGraphic(graphic.id)}>
                    Details
                  </Button>
                  <a
                    href={graphicDownloadUrl(graphic.id)}
                    download
                    data-testid="download-graphic"
                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-muted"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    Download
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <GraphicDetailDialog graphicId={openGraphicId} onClose={() => setOpenGraphic(null)} />
    </Card>
  );
}

/**
 * One graphic, opened on its own.
 *
 * The gallery shows a thumbnail; this dialog shows the whole copy, the colours
 * that were used, and the full-size image the author downloads.
 */
function GraphicDetailDialog({ graphicId, onClose }: { graphicId: string | null; onClose: () => void }) {
  const graphic = useMarketingGraphic(graphicId);
  return (
    <Dialog open={Boolean(graphicId)} onClose={onClose} title="Promotional graphic" description="The image and the copy that was rendered.">
      {graphic.isPending ? (
        <PageLoader />
      ) : graphic.error ? (
        <ErrorState message={errorMessage(graphic.error)} onRetry={() => void graphic.refetch()} />
      ) : graphic.data ? (
        <div className="space-y-4">
          {graphic.data.ready ? (
            <img
              src={graphicUrl(graphic.data.id)}
              alt={`Promotional graphic: ${graphic.data.headline}`}
              className="w-full rounded-xl border border-border bg-muted object-contain"
            />
          ) : (
            <div className="rounded-xl border border-border bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
              This graphic is still being rendered.
            </div>
          )}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Template</dt>
              <dd>{graphic.data.template.replace(/_/g, " ")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Size</dt>
              <dd>
                {graphic.data.width} × {graphic.data.height} pixels
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Headline</dt>
              <dd>{graphic.data.headline}</dd>
            </div>
            {graphic.data.subhead ? (
              <div>
                <dt className="text-xs text-muted-foreground">Supporting line</dt>
                <dd>{graphic.data.subhead}</dd>
              </div>
            ) : null}
            {graphic.data.callToAction ? (
              <div>
                <dt className="text-xs text-muted-foreground">Call to action</dt>
                <dd>{graphic.data.callToAction}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-muted-foreground">Background</dt>
              <dd className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-4 w-4 rounded border border-border"
                  style={{ background: graphic.data.backgroundColor }}
                />
                {graphic.data.backgroundColor}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Text</dt>
              <dd className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-4 w-4 rounded border border-border"
                  style={{ background: graphic.data.textColor }}
                />
                {graphic.data.textColor}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cover</dt>
              <dd>{graphic.data.usedCover ? "The book's cover is the background" : "Plain background"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Created</dt>
              <dd>{timeAgo(graphic.data.createdAt)}</dd>
            </div>
          </dl>
          <a
            href={graphicDownloadUrl(graphic.data.id)}
            download
            data-testid="graphic-detail-download"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download the image
          </a>
        </div>
      ) : null}
    </Dialog>
  );
}

/**
 * The sample chapter packs.
 *
 * A sample is a file the author hands out themselves — a free chapter to give
 * away, a reading sample for a listing. Nothing is emailed or posted; the
 * screen says so where an author would otherwise expect it to be sent.
 */
function SampleStudio({ bookId }: { bookId: string }) {
  const samples = useMarketingSamples(bookId);
  const create = useCreateMarketingSample(bookId);
  const chapters = useChapters(bookId);

  const [selected, setSelected] = useState<string[]>([]);
  const [format, setFormat] = useState<"pdf" | "epub" | "docx">("pdf");
  const [problem, setProblem] = useState<string | null>(null);

  const written = (chapters.data ?? []).filter(
    (chapter) => chapter.wordCount > 0 || chapter.status === "done",
  );
  const MAX_CHAPTERS = 5;

  const toggle = (chapterId: string) => {
    setSelected((current) => {
      if (current.includes(chapterId)) return current.filter((id) => id !== chapterId);
      if (current.length >= MAX_CHAPTERS) {
        setProblem(`A sample may contain at most ${MAX_CHAPTERS} chapters.`);
        return current;
      }
      setProblem(null);
      return [...current, chapterId];
    });
  };

  return (
    <Card className="p-5" data-testid="sample-studio">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Sample chapters</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose up to {MAX_CHAPTERS} chapters and build a file to hand out. Nothing is emailed or posted
            for you.
          </p>
        </div>
        <Download className="h-5 w-5 text-muted-foreground" />
      </div>

      {written.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Write at least one chapter before building a sample.
        </p>
      ) : (
        <>
          <fieldset className="mt-4">
            <legend className="text-xs font-medium text-muted-foreground">Chapters to include</legend>
            <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-border p-2">
              {written.map((chapter) => (
                <label
                  key={chapter.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(chapter.id)}
                    onChange={() => toggle(chapter.id)}
                    data-testid="sample-chapter-option"
                  />
                  <span className="truncate">{chapter.title}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Field label="File format" htmlFor="sample-format">
              <Select
                id="sample-format"
                value={format}
                onChange={(event) => setFormat(event.target.value as typeof format)}
                data-testid="sample-format"
              >
                <option value="pdf">PDF</option>
                <option value="epub">EPUB</option>
                <option value="docx">Word (DOCX)</option>
              </Select>
            </Field>
            <Button
              loading={create.isPending}
              disabled={selected.length === 0}
              onClick={() => {
                setProblem(null);
                create.mutate(
                  { chapterIds: selected, format },
                  {
                    onSuccess: () => {
                      setSelected([]);
                      void samples.refetch();
                    },
                    onError: (err) => setProblem(errorMessage(err)),
                  },
                );
              }}
              data-testid="create-sample"
            >
              <Download className="h-4 w-4" />
              Build sample
            </Button>
          </div>
        </>
      )}

      {problem && (
        <Alert tone="danger" className="mt-3">
          {problem}
        </Alert>
      )}

      {samples.data && samples.data.length > 0 && (
        <div className="mt-6 space-y-2">
          {samples.data.map((sample) => (
            <div
              key={sample.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
              data-testid="marketing-sample"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {sample.chapterTitles.length
                    ? sample.chapterTitles.join(", ")
                    : `${sample.chapterIds.length} chapters`}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {sample.format.toUpperCase()} · {timeAgo(sample.createdAt)}
                </p>
              </div>
              {sample.ready ? (
                <a
                  href={`/api/v1/marketing/samples/${sample.id}/download`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  data-testid="download-sample"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              ) : (
                <Badge tone="warning">Not ready</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function MarketingStudioPage() {
  const params = useParams<{ bookId?: string }>();
  const search = useSearchParams();
  return <MarketingStudio bookId={params.bookId ?? search.get("bookId") ?? ""} />;
}

/**
 * The studio itself.
 *
 * The book id arrives either from the path (`/app/books/[bookId]/marketing`) or
 * from the query (`/app/marketing?bookId=…`), so the same studio serves both
 * entry points.
 */
export function MarketingStudio({ bookId }: { bookId: string }) {
  const router = useRouter();

  const outputs = useMarketingOutputs();
  const drafts = useMarketingDrafts(bookId || null);
  const createDraft = useCreateMarketingDraft(bookId);
  const saveDraft = useSaveMarketingDraft(bookId);
  const regenerate = useRegenerateMarketingDraft(bookId);

  const [outputType, setOutputType] = useState<MarketingOutputType>("description");
  const [tone, setTone] = useState<MarketingTone>("clear");
  const [audience, setAudience] = useState("");
  const [instruction, setInstruction] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const catalog = useMemo(() => outputs.data ?? [], [outputs.data]);
  // The catalog arrives after the first render, so the selected type falls back
  // to the first one the server offers rather than being patched in later.
  const effectiveType = catalog.some((item) => item.outputType === outputType)
    ? outputType
    : (catalog[0]?.outputType ?? outputType);
  const selected = useMemo(
    () => catalog.find((item) => item.outputType === effectiveType),
    [catalog, effectiveType],
  );

  if (!bookId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
        <PageHeader title="Marketing studio" description="Pick a book to write launch material for." />
        <EmptyState
          icon={<Megaphone className="h-6 w-6" />}
          title="No book selected"
          description="Open the studio from a book's page to draft descriptions, captions and graphics."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <PageHeader
        title="Marketing studio"
        description="Write launch material for this book. Everything you make here is a file you download and use yourself — the studio never emails, posts or publishes on your behalf."
      />

      {notice && <Alert tone="success" className="mb-6">{notice}</Alert>}
      {problem && <Alert tone="danger" className="mb-6">{problem}</Alert>}

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Draft something new</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Each draft costs credits. The cost is shown next to the type before you spend any.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="What to write" htmlFor="marketing-output-type">
            <Select
              id="marketing-output-type"
              value={effectiveType}
              onChange={(event) => setOutputType(event.target.value as MarketingOutputType)}
              data-testid="marketing-output-type"
            >
              {catalog.map((item) => (
                <option key={item.outputType} value={item.outputType}>
                  {item.label} ({item.credits} credits)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tone" htmlFor="marketing-tone">
            <Select
              id="marketing-tone"
              value={tone}
              onChange={(event) => setTone(event.target.value as MarketingTone)}
              data-testid="marketing-tone"
            >
              {TONES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Who it is for (optional)" htmlFor="marketing-audience" className="sm:col-span-2">
            <Input
              id="marketing-audience"
              value={audience}
              maxLength={500}
              placeholder="Home cooks who have never baked bread"
              onChange={(event) => setAudience(event.target.value)}
              data-testid="marketing-audience"
            />
          </Field>
          <Field label="Extra direction (optional)" htmlFor="marketing-instruction" className="sm:col-span-2">
            <Textarea
              id="marketing-instruction"
              className="min-h-[80px]"
              value={instruction}
              maxLength={2000}
              placeholder="Mention the sourdough starter chapter. Keep it under 150 words."
              onChange={(event) => setInstruction(event.target.value)}
              data-testid="marketing-instruction"
            />
          </Field>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button
            loading={createDraft.isPending}
            disabled={!selected}
            onClick={() => {
              setNotice(null);
              setProblem(null);
              createDraft.mutate(
                { outputType: effectiveType, tone, audience: audience || undefined, instruction: instruction || undefined },
                {
                  onSuccess: () => {
                    setNotice("Draft written. Read it, edit it, then approve what you want to use.");
                    void drafts.refetch();
                  },
                  onError: (err) => setProblem(errorMessage(err)),
                },
              );
            }}
            data-testid="create-draft"
          >
            <Sparkles className="h-4 w-4" />
            Write {selected?.label.toLowerCase() ?? "draft"}
          </Button>
          {selected && (
            <span className="text-xs text-muted-foreground">
              Costs {formatNumber(selected.credits)} credits
            </span>
          )}
        </div>
      </Card>

      <Section title="Your drafts" className="mt-10">
        {drafts.isLoading ? (
          <PageLoader />
        ) : drafts.error ? (
          <ErrorState message={errorMessage(drafts.error)} onRetry={() => void drafts.refetch()} />
        ) : drafts.data && drafts.data.length > 0 ? (
          <div className="space-y-4">
            {drafts.data.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                saving={saveDraft.isPending}
                onRegenerate={() => {
                  setNotice(null);
                  setProblem(null);
                  regenerate.mutate(draft.id, {
                    onSuccess: () => {
                      setNotice("A new version was written. The original is kept.");
                      void drafts.refetch();
                    },
                    onError: (err) => setProblem(errorMessage(err)),
                  });
                }}
                onSave={(content, approve) => {
                  setNotice(null);
                  setProblem(null);
                  saveDraft.mutate(
                    { draftId: draft.id, content, approve },
                    {
                      onSuccess: () => {
                        setNotice(approve ? "Draft saved and approved." : "Draft saved.");
                        void drafts.refetch();
                      },
                      onError: (err) => setProblem(errorMessage(err)),
                    },
                  );
                }}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Megaphone className="h-6 w-6" />}
            title="No drafts yet"
            description="Write a description, a caption or a bio for this book to get started."
          />
        )}
      </Section>

      <Section title="Graphics" className="mt-10">
        <GraphicStudio bookId={bookId} />
      </Section>

      <Section title="Sample chapters" className="mt-10">
        <SampleStudio bookId={bookId} />
      </Section>

      <div className="mt-8 flex justify-end">
        <Button variant="ghost" onClick={() => router.back()}>
          <Trash2 className="h-4 w-4" />
          Back to the book
        </Button>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Prefer to see this beside the manuscript?{" "}
        <Link href={`/app/books/${bookId}`} className="underline">
          Open the book
        </Link>
      </p>
    </div>
  );
}
