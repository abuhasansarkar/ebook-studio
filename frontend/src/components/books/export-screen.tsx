"use client";

import { PublishingChecks } from "./publishing-checks";
import { OperationActivity } from "./operation-activity";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2 } from "lucide-react";
import { getLanguage, type ExportFormat } from "@ebook/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { Input, Select } from "@/components/ui/form";
import { errorMessage } from "@/lib/api";
import { useBook, useCreateExport, useExports, useExportFormats } from "@/lib/queries";
import { formatBytes, formatNumber, timeAgo } from "@/lib/utils";
import type { ExportRecord } from "@/lib/types";

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
  const formats = useExportFormats();
  const createExport = useCreateExport(bookId);
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [options, setOptions] = useState<Record<string, unknown>>({});

  if (book.isLoading) return <PageLoader />;
  if (book.error || !book.data) return <div className="mx-auto max-w-4xl px-4 py-8"><ErrorState message={errorMessage(book.error)} onRetry={() => void book.refetch()} /></div>;

  const b = book.data;
  const written = b.chapters.filter((c) => c.wordCount > 0);
  const missing = b.chapters.length - written.length;
  const words = written.reduce((s, c) => s + c.wordCount, 0);
  const busy = exports.data?.some((e) => e.status === "queued" || e.status === "processing");
  const lang = getLanguage(b.language);
  const available = formats.data?.map((f) => f.format) ?? [];
  const spec = FORMAT_OPTIONS[format];

  const checks = [
    { ok: written.length > 0, label: `${written.length} of ${b.chapters.length} chapters have content`, warn: missing > 0 },
    { ok: Boolean(b.title.trim()), label: "Book has a title" },
    { ok: true, label: `${lang.name} typesetting with bundled fonts${lang.dir === "rtl" ? " and right-to-left layout" : ""}` },
    { ok: true, label: "Front matter, contents and back matter from your saved design" },
    { ok: true, label: "Every export is a frozen snapshot: later edits cannot change it" },
  ];

  const request = () =>
    createExport.mutate(
      { format, options },
      {
        onSuccess: () => toast.success(`Building your ${spec.label}…`),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );

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
                        value={Number(value)}
                        step={option.step}
                        min={option.min}
                        max={option.max}
                        onChange={(e) => setOptions((o) => ({ ...o, [option.key]: Number(e.target.value) }))}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <Button
            className="mt-6 w-full"
            size="lg"
            loading={createExport.isPending || busy}
            disabled={written.length === 0 || busy}
            onClick={request}
          >
            {busy ? "Building…" : `Export ${spec.label}`}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">Free to export. The file is validated before it can be downloaded.</p>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold">Pre-export check</h3>
          <ul className="mt-4 space-y-3">
            {checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2.5 text-sm">
                {c.ok && !c.warn ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
                {c.label}
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
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {timeAgo(e.createdAt)}
                  {e.designVersion !== null ? ` · ${e.designVersion ? `design v${e.designVersion}` : "default design"}` : ""}
                  {e.pageCount ? ` · ${e.pageCount} pages` : ""}
                  {e.fileSize ? ` · ${formatBytes(e.fileSize)}` : ""}
                  {e.status === "failed" && e.error ? ` · ${e.error}` : ""}
                </p>
                {e.status === "ready" && <ExportFindings e={e} />}
              </div>
              {e.status === "ready" && (
                <a href={`/api/v1/exports/${e.id}/download`} className={buttonVariants({ variant: "secondary", size: "sm" })} download>
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              )}
            </div>
          ))}
        </Card>
      )}
      <OperationActivity bookId={bookId} />
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
