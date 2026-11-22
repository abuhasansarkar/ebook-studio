"use client";

import { PublishingChecks } from "./publishing-checks";
import { OperationActivity } from "./operation-activity";
import Link from "next/link";
import { use, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2 } from "lucide-react";
import { getLanguage, type ExportFormat } from "@ebook/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { Input, Select } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { useBook, useCreateExport, useExports, useExportFormats, useBilling } from "@/lib/queries";
import { formatBytes, formatNumber, timeAgo, cn } from "@/lib/utils";
import type { ExportRecord } from "@/lib/types";
import { ProPlansModal } from "@/components/billing/pro-plans-modal";
import { Sparkles as SparklesIcon } from "lucide-react";

/**
 * The export screen.
 *
 * Only formats the server reports as renderable are offered, each format shows
 * the options that apply to it, and a download is enabled only after the server
 * confirms the file is ready and has validated it.
 */

interface OptionSpec {
  key: string;
  label: string;
  type: "boolean" | "number" | "choice";
  choices?: { value: string; label: string }[];
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
}

const FORMAT_OPTIONS: Record<ExportFormat, { label: string; hint: string; options: OptionSpec[] }> = {
  pdf: {
    label: "PDF",
    hint: "Fixed-layout pages using your saved print design (trim, margins and type size). Use this for print preparation and for buyers who want the exact layout.",
    options: [
      { key: "layout", label: "Layout", type: "choice", choices: [{ value: "print", label: "Print (fixed trim and margins)" }, { value: "digital", label: "Digital (reflowed pages)" }], default: "print" },
      { key: "includeMatter", label: "Include front and back matter", type: "boolean", default: true },
      { key: "includeToc", label: "Include the table of contents", type: "boolean", default: true },
    ],
  },
  epub: {
    label: "EPUB",
    hint: "Reflowable eBook for Kindle, Kobo and Apple Books. The text reflows to the reader’s screen, so the print trim and margins do not apply.",
    options: [
      { key: "includeMatter", label: "Include front and back matter", type: "boolean", default: true },
      { key: "includeCover", label: "Embed the cover image", type: "boolean", default: true },
      { key: "fontScale", label: "Text size", type: "number", default: 1, min: 0.85, max: 1.4, step: 0.05 },
    ],
  },
  docx: {
    label: "DOCX",
    hint: "Editable Word manuscript. The table of contents is a field that Word fills in when you update fields, so page numbers appear after that refresh.",
    options: [
      { key: "includeMatter", label: "Include front and back matter", type: "boolean", default: true },
      { key: "fontSizePt", label: "Body text size (pt)", type: "number", default: 11, min: 8, max: 14, step: 0.5 },
      { key: "repeatTableHeaders", label: "Repeat table headers on each page", type: "boolean", default: true },
    ],
  },
};

export function ExportScreen({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const book = useBook(bookId);
  const exports = useExports(bookId);
  // What the pre-export check reports on besides the text: the saved cover and the latest review.
  const cover = useQuery({ queryKey: ["export-cover", bookId], queryFn: () => api.get<{ cover: { version: number; data: { artworkId?: string | null } } }>(`/books/${bookId}/cover`).then((r) => r.cover) });
  const reviews = useQuery({ queryKey: ["quality-reports", bookId], queryFn: () => api.get<{ reports: { id: string; stale: boolean; status: string; createdAt: string }[] }>(`/books/${bookId}/quality/reports`).then((r) => r.reports) });
  const formats = useExportFormats();
  const createExport = useCreateExport(bookId);
  const billing = useBilling();
  const [showProModal, setShowProModal] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [options, setOptions] = useState<Record<string, unknown>>({});

  const hasExportEntitlement = Boolean(billing.data?.entitlements?.exports);

  // isPending, not isLoading: the book query waits for the session, and a
  // waiting query is pending without loading (see generate-screen).
  if (book.isPending && !book.error) return <PageLoader />;
  if (book.error || !book.data) return <div className="mx-auto max-w-4xl px-4 py-8"><ErrorState message={errorMessage(book.error)} onRetry={() => void book.refetch()} /></div>;

  const b = book.data;
  const written = b.chapters.filter((c) => c.wordCount > 0);
  const missing = b.chapters.length - written.length;
  const words = written.reduce((s, c) => s + c.wordCount, 0);
  const busy = exports.data?.some((e) => e.status === "queued" || e.status === "processing");
  const lang = getLanguage(b.language);
  const available = formats.data?.map((f) => f.format) ?? [];
  const spec = FORMAT_OPTIONS[format];

  const savedCover = cover.data && cover.data.version > 0 ? cover.data : null;
  const latestReview = reviews.data?.find((r) => r.status === "completed") ?? null;
  const author = b.brief.authorName?.trim();
  const checks: { ok: boolean; warn?: boolean; label: ReactNode; key: string }[] = [
    { key: "chapters", ok: written.length > 0, label: `${written.length} of ${b.chapters.length} chapters have content`, warn: missing > 0 },
    { key: "title", ok: Boolean(b.title.trim()), label: `Title: “${b.title}”${author ? ` · by ${author}` : ""}` },
    ...(author ? [] : [{ key: "author", ok: true, warn: true, label: <>No author name. <Link href={`/app/books/${bookId}/brief`} className="font-medium underline">Add one in the brief</Link> to show it on the title page.</> }]),
    {
      key: "cover",
      ok: Boolean(savedCover),
      warn: !savedCover,
      label: savedCover
        ? <>Cover version {savedCover.version}{savedCover.data.artworkId ? " with artwork" : ""}: EPUB files carry it. <Link href={`/app/books/${bookId}/cover`} className="font-medium underline">Edit cover</Link></>
        : <>No cover yet. <Link href={`/app/books/${bookId}/cover`} className="font-medium underline">Design one</Link> before publishing an EPUB.</>,
    },
    {
      key: "review",
      ok: Boolean(latestReview && !latestReview.stale),
      warn: !latestReview || latestReview.stale,
      label: !latestReview
        ? <>No quality review yet (optional). <Link href={`/app/books/${bookId}/quality`} className="font-medium underline">Run checks</Link></>
        : latestReview.stale
          ? <>Quality review is out of date: the book changed after it. <Link href={`/app/books/${bookId}/quality`} className="font-medium underline">Run checks again</Link></>
          : "Quality review is up to date",
    },
    { key: "fonts", ok: true, label: `${lang.name} typesetting with bundled fonts${lang.dir === "rtl" ? " and right-to-left layout" : ""}` },
    { key: "design", ok: true, label: "Front matter, contents and back matter from your saved design" },
    { key: "snapshot", ok: true, label: "Every export is a frozen snapshot: later edits cannot change it" },
  ];

  const request = () => {
    if (!hasExportEntitlement) {
      setShowProModal(true);
      return;
    }
    createExport.mutate(
      // A cleared number box means "use the default", so it is left out.
      { format, options: Object.fromEntries(Object.entries(options).filter(([, v]) => v !== "")) },
      {
        onSuccess: () => toast.success(`Building your ${spec.label}…`),
        onError: (err) => {
          const msg = errorMessage(err);
          if (msg.toLowerCase().includes("exports") || msg.toLowerCase().includes("capability") || msg.toLowerCase().includes("plan")) {
            setShowProModal(true);
          } else {
            toast.error(msg);
          }
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Build a file</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose a format and build it from your latest saved{" "}
                <Link href={`/app/books/${bookId}/design`} className="font-medium underline">interior design</Link>. Unsaved design changes are not included.
                Review the downloaded file before sale; marketplace approval is never guaranteed.
              </p>
            </div>
          </div>

          <fieldset className="mt-6">
            <legend className="text-sm font-semibold">Format</legend>
            <div className="mt-2 grid gap-2">
              {(["pdf", "epub", "docx"] as ExportFormat[]).map((f) => {
                const enabled = available.length === 0 || available.includes(f);
                return (
                  <label
                    key={f}
                    data-format={f}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-sm transition-colors ${format === f ? "border-primary bg-primary-soft/40" : "border-border hover:bg-muted"} ${enabled ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                  >
                    <input
                      type="radio"
                      name="export-format"
                      value={f}
                      checked={format === f}
                      disabled={!enabled}
                      onChange={() => { setFormat(f); setOptions({}); }}
                      className="mt-1 accent-primary"
                    />
                    <span>
                      <span className="font-semibold">{FORMAT_OPTIONS[f].label}</span>
                      <span className="block text-xs text-muted-foreground">{FORMAT_OPTIONS[f].hint}</span>
                      {!enabled && <span className="mt-1 block text-xs text-warning">This server cannot produce {FORMAT_OPTIONS[f].label} files.</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="text-sm font-semibold">{spec.label} options</legend>
            <div className="mt-2 space-y-2">
              {spec.options.map((option) => {
                const value = options[option.key] ?? option.default;
                return (
                  <label key={option.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{option.label}</span>
                    {option.type === "boolean" && (
                      <input
                        type="checkbox"
                        data-option={option.key}
                        checked={Boolean(value)}
                        onChange={(e) => setOptions((o) => ({ ...o, [option.key]: e.target.checked }))}
                        className="h-4 w-4 accent-primary"
                      />
                    )}
                    {option.type === "choice" && (
                      <Select
                        data-option={option.key}
                        className="h-9 w-auto py-0"
                        value={String(value)}
                        onChange={(e) => setOptions((o) => ({ ...o, [option.key]: e.target.value }))}
                      >
                        {option.choices?.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </Select>
                    )}
                    {option.type === "number" && (
                      <Input
                        type="number"
                        data-option={option.key}
                        className="h-9 w-24 py-0"
                        value={value === "" ? "" : Number(value)}
                        step={option.step}
                        min={option.min}
                        max={option.max}
                        // An emptied box is kept empty while typing and falls back to the
                        // default when left, instead of sending 0.
                        onChange={(e) => setOptions((o) => ({ ...o, [option.key]: e.target.value === "" ? "" : Number(e.target.value) }))}
                        onBlur={(e) => { if (e.target.value === "") setOptions((o) => { const next = { ...o }; delete next[option.key]; return next; }); }}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {!hasExportEntitlement && (
            <div className="mt-5 rounded-2xl border border-[#e8603c]/30 bg-[#e8603c]/5 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-[#e8603c]/10 p-2 text-[#e8603c] shrink-0">
                  <SparklesIcon className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#e8603c]">
                    Pro Feature Locked
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Free trial accounts cannot export files. Upgrade to any Pro plan to unlock unlimited PDF, EPUB, and DOCX exports with full commercial rights.
                  </p>
                </div>
              </div>
            </div>
          )}

          <Button
            className={cn(
              "mt-6 w-full font-bold",
              !hasExportEntitlement && "bg-[#e8603c] hover:bg-[#d4512e] text-white shadow-md",
            )}
            size="lg"
            loading={createExport.isPending || busy}
            disabled={written.length === 0 || busy}
            onClick={request}
          >
            {busy ? "Building…" : !hasExportEntitlement ? `Upgrade to Pro to Export ${spec.label}` : `Export ${spec.label}`}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {!hasExportEntitlement
              ? "Exports are included on all Pro plans. Cancel anytime."
              : "Included with your Pro plan. The file is validated before download."}
          </p>
          <details className="mt-4 rounded-xl border border-border px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium">How to check your file before selling it</summary>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-muted-foreground">
              <li><strong className="text-foreground">PDF:</strong> open it in a PDF reader and page through at full size; check headings, page breaks and images.</li>
              <li><strong className="text-foreground">EPUB:</strong> open it in Apple Books, and in Amazon&apos;s free Kindle Previewer for Kindle, at a small and a large text size.</li>
              <li><strong className="text-foreground">DOCX:</strong> open it in Microsoft Word or LibreOffice and check styles, the contents page and tables.</li>
              <li>Each store reviews books itself; a file that validates here can still need changes for a store.</li>
            </ul>
          </details>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold">Pre-export check</h3>
          <ul className="mt-4 space-y-3">
            {checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2.5 text-sm">
                {c.ok && !c.warn ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="OK" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-label="Check" />}
                <span>{c.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">{formatNumber(words)} words in total.</p>
          {missing > 0 && (
            <Alert tone="warning" className="mt-4">
              {missing} empty chapter{missing === 1 ? " is" : "s are"} left out of the file.{" "}
              <Link href={`/app/books/${bookId}/generate`} className="font-semibold underline">Write them</Link>
            </Alert>
          )}
        </Card>
      </div>

      <PublishingChecks bookId={bookId} />
      <h3 className="mb-3 mt-10 text-lg font-semibold">Export history</h3>
      {exports.isLoading ? (
        <PageLoader />
      ) : exports.error ? (
        <ErrorState message={errorMessage(exports.error)} onRetry={() => void exports.refetch()} />
      ) : !exports.data?.length ? (
        written.length === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="Nothing to export yet" description="Write at least one chapter first." action={<Link href={`/app/books/${bookId}/generate`} className={buttonVariants()}>Write chapters</Link>} />
        ) : (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="No exports yet" description="Your files will appear here, ready to download." />
        )
      ) : (
        <Card className="divide-y divide-border">
          {exports.data.map((e) => (
            <div key={e.id} data-export={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  {e.format.toUpperCase()}
                  {e.status === "ready" && <Badge tone="success">Ready</Badge>}
                  {(e.status === "queued" || e.status === "processing") && (
                    <Badge tone="warning">
                      <Loader2 className="h-3 w-3 animate-spin" /> Building
                    </Badge>
                  )}
                  {e.status === "failed" && <Badge tone="danger">Failed</Badge>}
                  {e.status === "ready" && e.stale && <Badge tone="warning">Older text</Badge>}
                </p>
                {e.summary && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    “{e.summary.title}”{e.summary.author ? ` by ${e.summary.author}` : ""} · {e.summary.chapters} chapter{e.summary.chapters === 1 ? "" : "s"} · {e.summary.hasCover ? "with cover" : "no cover"}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {timeAgo(e.createdAt)}
                  {e.designVersion !== null ? ` · ${e.designVersion ? `design v${e.designVersion}` : "default design"}` : ""}
                  {e.pageCount ? ` · ${e.pageCount} pages` : ""}
                  {e.fileSize ? ` · ${formatBytes(e.fileSize)}` : ""}
                  {e.status === "failed" && e.error ? ` · ${e.error}` : ""}
                </p>
                {e.status === "ready" && e.stale && (
                  <p className="mt-1 text-xs text-warning">The manuscript changed after this file was made. Export again for the latest text.</p>
                )}
                {e.status === "ready" && <ExportFindings e={e} />}
              </div>
              {e.status === "ready" && (
                <Button
                  variant="secondary"
                  size="sm"
                  data-href={`/api/v1/exports/${e.id}/download`}
                  onClick={() => downloadFile(`/api/v1/exports/${e.id}/download`, `book.${e.format}`).catch((err) => toast.error(errorMessage(err)))}
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              )}
            </div>
          ))}
        </Card>
      )}
      <OperationActivity bookId={bookId} />
      <ProPlansModal open={showProModal} onClose={() => setShowProModal(false)} />
    </div>
  );
}

/**
 * The validation result of the stored file, plus the render findings.
 *
 * A ready export is only shown as validated when the server re-opened the
 * stored file and checked it; the wording never claims more than that.
 */
function ExportFindings({ e }: { e: ExportRecord }) {
  const validation = e.validation;
  const warnings = validation?.issues.filter((i) => i.severity === "warning") ?? [];
  const d = e.diagnostics;
  const missing = d?.glyphs.reduce((n, g) => n + g.count, 0) ?? 0;
  const findings = [
    missing ? `${missing} character${missing === 1 ? "" : "s"} without an approved font (${d?.glyphs.flatMap((g) => g.characters.map((c) => c.char)).slice(0, 8).join(" ")})` : "",
    d?.foreignFonts.length ? `system fonts used: ${d.foreignFonts.join(", ")}` : "",
    d?.overflow.length ? `${d.overflow.length} element${d.overflow.length === 1 ? "" : "s"} wider than the page text block` : "",
    d?.type3Fonts.length ? `Type 3 fonts: ${d.type3Fonts.join(", ")}` : "",
  ].filter(Boolean);

  return (
    <div className="mt-1 space-y-1">
      {validation?.passed && (
        <p className="flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="h-3 w-3" />
          Validated: the stored file was re-opened and checked by the {validation.validator} validator.
        </p>
      )}
      {!validation && (
        <p className="flex items-start gap-1 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />This export was made before file validation existed, so it has not been checked.
        </p>
      )}
      {warnings.map((w) => (
        <p key={w.code} className="flex items-start gap-1 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w.message}
        </p>
      ))}
      {findings.length > 0 ? (
        <p className="flex items-start gap-1 text-xs text-warning"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />Review: {findings.join("; ")}.</p>
      ) : (
        <p className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3 w-3" />Bundled fonts only; nothing clipped at the page edge.</p>
      )}
    </div>
  );
}
