"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronUp, CheckCircle2, Circle, FileDown, PenLine, Plus, Wand2 } from "lucide-react";
import { getLanguage } from "@ebook/shared";
import { ChapterEditor } from "@/components/editor/chapter-editor";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, EmptyState, ErrorState, PageLoader, Spinner } from "@/components/ui/misc";
import { useSession } from "@/lib/auth-client";
import { errorMessage } from "@/lib/api";
import { useBook, useChapter, useChapters, useCreateChapter, useReorderChapters } from "@/lib/queries";
import { toast } from "sonner";
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
  const { data: session } = useSession();
  const book = useBook(bookId);
  const generating = book.data?.activeJob?.type === "chapters";
  const chapters = useChapters(bookId, generating);
  const reorder = useReorderChapters(bookId);
  const createChapter = useCreateChapter(bookId);
  const [moveNotice, setMoveNotice] = useState("");
  const search = useSearchParams();
  // Links from the quality review open a chapter and highlight one finding.
  const [pickedId, setSelectedId] = useState<string | null>(search.get("chapter"));
  const findingId = search.get("finding");
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

  // isPending, not isLoading: the book query waits for the session, and a
  // waiting query is pending without loading (see generate-screen).
  if ((book.isPending && !book.error) || (chapters.isPending && !chapters.error)) return <PageLoader />;
  if (book.error || chapters.error) return <div className="mx-auto max-w-4xl px-4 py-8"><ErrorState message={errorMessage(book.error ?? chapters.error)} onRetry={() => { void book.refetch(); void chapters.refetch(); }} /></div>;
  if (!chapters.data?.length) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState
          icon={<PenLine className="h-6 w-6 text-primary" />}
          title="No chapters yet"
          description="Start writing your first chapter manually or generate your book's outline with AI."
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                onClick={() => {
                  createChapter.mutate(
                    { title: "Chapter 1" },
                    {
                      onSuccess: (newChap) => {
                        setSelectedId(newChap.id);
                        toast.success("Chapter 1 created! Start writing.");
                      },
                      onError: (err) => toast.error(errorMessage(err)),
                    },
                  );
                }}
                disabled={createChapter.isPending}
                className="gap-2 shadow-sm"
              >
                <Plus className="h-4 w-4" /> Write First Chapter
              </Button>
              <Link href={`/app/books/${bookId}/outline`} className={buttonVariants({ variant: "secondary", className: "gap-1.5" })}>
                <Wand2 className="h-4 w-4" /> Generate Outline with AI
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const dir = getLanguage(language).dir;
  const totalWords = chapters.data.reduce((s, c) => s + c.wordCount, 0);

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col lg:flex-row">
      <aside className="border-b border-border bg-surface lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-e">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Chapters</p>
            <p className="text-xs text-muted-foreground">{formatNumber(totalWords)} words total</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1 px-2.5 text-xs font-semibold text-primary hover:text-primary-hover"
              disabled={createChapter.isPending}
              onClick={() => {
                const nextNum = (chapters.data?.length ?? 0) + 1;
                createChapter.mutate(
                  { title: `Chapter ${nextNum}` },
                  {
                    onSuccess: (newChap) => {
                      setSelectedId(newChap.id);
                      toast.success(`Created Chapter ${nextNum}`);
                    },
                    onError: (err) => toast.error(errorMessage(err)),
                  },
                );
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Chapter
            </Button>
            <Link href={`/app/books/${bookId}/export`} className={buttonVariants({ variant: "soft", size: "sm" })}>
              <FileDown className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:overflow-visible" aria-label="Chapters">
          {chapters.data.map((c, index) => {
            const active = c.id === selectedId;
            const list = chapters.data!;
            const move = (delta: -1 | 1) => {
              const order = list.map((x) => x.id);
              [order[index], order[index + delta]] = [order[index + delta], order[index]];
              reorder.mutate(order, {
                onSuccess: () => setMoveNotice(`Moved “${c.title}” to position ${index + delta + 1}.`),
                onError: (err) => toast.error(errorMessage(err)),
              });
            };
            return (
              <div key={c.id} className="group flex min-w-48 items-stretch gap-0.5 lg:min-w-0">
              <button
                type="button"
                data-editor-navigation="true"
                onClick={() => setSelectedId(c.id)}
                aria-current={active ? "true" : undefined}
                className={cn("flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 text-start text-sm", active ? "bg-primary-soft" : "hover:bg-muted")}
              >
                {c.status === "done" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : c.status === "generating" ? <Spinner className="mt-0.5 h-4 w-4 shrink-0" /> : c.status === "failed" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-border" />}
                <span className="min-w-0">
                  <span dir={dir} className={cn("line-clamp-2", active && "font-semibold")}>
                    {c.position + 1}. {c.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{c.wordCount ? `${formatNumber(c.wordCount)} words` : "Empty"}</span>
                </span>
              </button>
              {/* Reorder buttons: visible on focus/hover on desktop, always on touch screens. */}
              <span className="flex flex-col justify-center opacity-100 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                <button type="button" className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Move chapter ${index + 1} up`} title="Move up" disabled={index === 0 || generating || reorder.isPending} onClick={() => move(-1)}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Move chapter ${index + 1} down`} title="Move down" disabled={index === list.length - 1 || generating || reorder.isPending} onClick={() => move(1)}>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </span>
              </div>
            );
          })}
        </nav>
        <p role="status" className="sr-only">{moveNotice}</p>
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
          <ChapterEditor key={`${session?.user.id}:${chapter.data.id}`} ownerId={session?.user.id ?? ""} chapter={chapter.data} bookId={bookId} language={language} findingId={chapter.data.id === search.get("chapter") ? findingId : null} />
        )}
      </section>
    </div>
  );
}
