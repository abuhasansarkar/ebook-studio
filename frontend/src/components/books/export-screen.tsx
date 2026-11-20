"use client";

import { PublishingChecks } from "./publishing-checks";
import { OperationActivity } from "./operation-activity";
import Link from "next/link";
import { use } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2 } from "lucide-react";
import { getLanguage } from "@ebook/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useBook, useCreateExport, useExports } from "@/lib/queries";
import { formatBytes, formatNumber, timeAgo } from "@/lib/utils";
import type { ExportRecord } from "@/lib/types";

export function ExportScreen({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const book = useBook(bookId);
  const exports = useExports(bookId);
  const createExport = useCreateExport(bookId);

  if (book.isLoading) return <PageLoader />;
  if (book.error || !book.data) return <div className="mx-auto max-w-4xl px-4 py-8"><ErrorState message={errorMessage(book.error)} onRetry={() => void book.refetch()} /></div>;

  const b = book.data;
  const written = b.chapters.filter((c) => c.wordCount > 0);
  const missing = b.chapters.length - written.length;
  const words = written.reduce((s, c) => s + c.wordCount, 0);
  const busy = exports.data?.some((e) => e.status === "queued" || e.status === "processing");
  const lang = getLanguage(b.language);

  const checks = [
    { ok: written.length > 0, label: `${written.length} of ${b.chapters.length} chapters have content`, warn: missing > 0 },
    { ok: Boolean(b.title.trim()), label: "Book has a title" },
    { ok: true, label: `${lang.name} typesetting with bundled fonts${lang.dir === "rtl" ? " and right-to-left layout" : ""}` },
    { ok: true, label: "Front matter, contents and back matter from your saved design" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">PDF manuscript</h2>
              <p className="mt-1 text-sm text-muted-foreground">Print-layout PDF using your latest saved <Link href={`/app/books/${bookId}/design`} className="font-medium underline">interior design</Link> (trim, margins, typography and matter). Unsaved design changes are not included. Review the file before sale; KDP print specifications need separate validation. Free to export.</p>
            </div>
          </div>
          <Button
            className="mt-6 w-full"
            size="lg"
            loading={createExport.isPending || busy}
            disabled={written.length === 0}
            onClick={() =>
              createExport.mutate(undefined, {
                onSuccess: () => toast.success("Building your PDF…"),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            {busy ? "Building PDF…" : "Export PDF"}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">EPUB and DOCX export are coming next.</p>
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
              {missing} empty chapter{missing === 1 ? " is" : "s are"} left out of the PDF.{" "}
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
          <EmptyState icon={<FileText className="h-6 w-6" />} title="No exports yet" description="Your PDFs will appear here, ready to download." />
        )
      ) : (
        <Card className="divide-y divide-border">
          {exports.data.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  PDF
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
                {e.status === "ready" && e.diagnostics && <ExportFindings d={e.diagnostics} />}
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

function ExportFindings({ d }: { d: NonNullable<ExportRecord["diagnostics"]> }) {
  const missing = d.glyphs.reduce((n, g) => n + g.count, 0);
  const findings = [
    missing ? `${missing} character${missing === 1 ? "" : "s"} without an approved font (${d.glyphs.flatMap((g) => g.characters.map((c) => c.char)).slice(0, 8).join(" ")})` : "",
    d.foreignFonts.length ? `system fonts used: ${d.foreignFonts.join(", ")}` : "",
    d.overflow.length ? `${d.overflow.length} element${d.overflow.length === 1 ? "" : "s"} wider than the page text block` : "",
    d.type3Fonts.length ? `Type 3 fonts: ${d.type3Fonts.join(", ")}` : "",
  ].filter(Boolean);
  return findings.length
    ? <p className="mt-1 flex items-start gap-1 text-xs text-warning"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />Review: {findings.join("; ")}.</p>
    : <p className="mt-1 flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3 w-3" />Bundled fonts only; nothing clipped at the page edge.</p>;
}
