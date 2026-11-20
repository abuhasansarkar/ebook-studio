"use client";

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
    { ok: true, label: `${lang.name} typesetting with ${lang.dir === "rtl" ? "right-to-left layout" : "native fonts"}` },
    { ok: true, label: "Title page, copyright page and clickable table of contents" },
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
              <h2 className="text-lg font-semibold">Print-ready PDF</h2>
              <p className="mt-1 text-sm text-muted-foreground">6 × 9 in trade paperback size, embedded fonts, page numbers and a clickable table of contents. Free to export.</p>
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
                  {e.pageCount ? ` · ${e.pageCount} pages` : ""}
                  {e.fileSize ? ` · ${formatBytes(e.fileSize)}` : ""}
                  {e.status === "failed" && e.error ? ` · ${e.error}` : ""}
                </p>
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
    </div>
  );
}
