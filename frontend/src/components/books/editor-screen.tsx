"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, FileDown, Wand2 } from "lucide-react";
import { getLanguage } from "@ebook/shared";
import { ChapterEditor } from "@/components/editor/chapter-editor";
import { buttonVariants } from "@/components/ui/button";
import { Alert, EmptyState, ErrorState, PageLoader, Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useBook, useChapter, useChapters } from "@/lib/queries";
import { cn, formatNumber } from "@/lib/utils";

/** Loads the language's Noto font so the editor matches the exported book. */
function useBookFont(language: string) {
  useEffect(() => {
    const family = getLanguage(language).fontFamily.match(/"([^"]+)"/)?.[1];
    if (!family) return;
    const id = `book-font-${family.replace(/\s+/g, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;700&display=swap`;
    document.head.appendChild(link);
  }, [language]);
}

export function EditorScreen({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const book = useBook(bookId);
  const generating = book.data?.activeJob?.type === "chapters";
  const chapters = useChapters(bookId, generating);
  const [pickedId, setSelectedId] = useState<string | null>(null);
  const language = book.data?.language ?? "en";
  useBookFont(language);

  // Default to the first chapter that has content.
  const selectedId = pickedId ?? (chapters.data?.find((c) => c.status === "done") ?? chapters.data?.[0])?.id ?? null;

  const chapter = useChapter(selectedId);
  const selectedMeta = chapters.data?.find((c) => c.id === selectedId);
  const { refetch: refetchChapter } = chapter;
  const openStatus = chapter.data?.status;

  // A chapter opened while the AI was writing it reloads once it's finished.
  useEffect(() => {
    if (openStatus && openStatus !== "done" && selectedMeta?.status === "done") void refetchChapter();
  }, [openStatus, selectedMeta?.status, refetchChapter]);

  if (book.isLoading || chapters.isLoading) return <PageLoader />;
  if (book.error || chapters.error) return <div className="mx-auto max-w-4xl px-4 py-8"><ErrorState message={errorMessage(book.error ?? chapters.error)} onRetry={() => { void book.refetch(); void chapters.refetch(); }} /></div>;
  if (!chapters.data?.length) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState icon={<Wand2 className="h-6 w-6" />} title="Nothing to edit yet" description="Approve your outline and write the chapters first." action={<Link href={`/app/books/${bookId}/outline`} className={buttonVariants()}>Go to outline</Link>} />
      </div>
    );
  }

  const dir = getLanguage(language).dir;
  const totalWords = chapters.data.reduce((s, c) => s + c.wordCount, 0);

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col lg:flex-row">
      <aside className="border-b border-border bg-surface lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-e">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-semibold">Chapters</p>
            <p className="text-xs text-muted-foreground">{formatNumber(totalWords)} words total</p>
          </div>
          <Link href={`/app/books/${bookId}/export`} className={buttonVariants({ variant: "soft", size: "sm" })}>
            <FileDown className="h-3.5 w-3.5" /> Export
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:overflow-visible" aria-label="Chapters">
          {chapters.data.map((c) => {
            const active = c.id === selectedId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                aria-current={active ? "true" : undefined}
                className={cn("flex min-w-48 cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 text-start text-sm lg:min-w-0", active ? "bg-primary-soft" : "hover:bg-muted")}
              >
                {c.status === "done" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : c.status === "generating" ? <Spinner className="mt-0.5 h-4 w-4 shrink-0" /> : c.status === "failed" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-border" />}
                <span className="min-w-0">
                  <span dir={dir} className={cn("line-clamp-2", active && "font-semibold")}>
                    {c.position + 1}. {c.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{c.wordCount ? `${formatNumber(c.wordCount)} words` : "Empty"}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {generating && (
          <Alert tone="info" className="m-4 mb-0">
            AI is still writing some chapters. Finished chapters can be edited now. <Link href={`/app/books/${bookId}/generate`} className="font-semibold underline">See progress</Link>
          </Alert>
        )}
        {chapter.isLoading || !chapter.data ? (
          chapter.error ? <div className="p-8"><ErrorState message={errorMessage(chapter.error)} onRetry={() => void chapter.refetch()} /></div> : <PageLoader label="Opening chapter…" />
        ) : chapter.data.status === "generating" ? (
          <div className="p-8"><EmptyState icon={<Spinner className="h-6 w-6" />} title="This chapter is being written" description="It will open for editing as soon as the AI finishes." /></div>
        ) : (
          <ChapterEditor key={chapter.data.id} chapter={chapter.data} bookId={bookId} language={language} />
        )}
      </section>
    </div>
  );
}
