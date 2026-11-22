"use client";

import Link from "next/link";
import { BookOpen, Calendar, Clock, PenLine, Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useBooks } from "@/lib/queries";
import { formatNumber, timeAgo } from "@/lib/utils";
import { getLanguage } from "@ebook/shared";

export default function GlobalEditorPage() {
  const { data: books, isPending, error, refetch } = useBooks();

  if (isPending) {
    return <PageLoader label="Opening your editor workspace…" />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      </div>
    );
  }

  const standardBooks = books?.filter((b) => b.bookType !== "coloring_book") ?? [];
  const latestBook = standardBooks[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader
        title="eBook Editor"
        description="Write, refine, format chapters, and organize your manuscripts."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/app/create" className={buttonVariants()}>
              <Plus className="h-4 w-4" /> New eBook
            </Link>
          </div>
        }
      />

      {standardBooks.length === 0 ? (
        <EmptyState
          icon={<PenLine className="h-8 w-8 text-primary" />}
          title="No eBooks to edit yet"
          description="Create your first eBook project to start drafting chapters manually or with AI guidance."
          action={
            <Link href="/app/create" className={buttonVariants()}>
              <Plus className="h-4 w-4" /> Start Your First eBook
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {/* Recent Active Manuscript Banner */}
          {latestBook && (
            <Card className="overflow-hidden border-primary/30 bg-gradient-to-r from-primary-soft/40 via-surface to-surface p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                      <Sparkles className="h-3 w-3" /> Recent Manuscript
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Edited {timeAgo(latestBook.updatedAt)}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">{latestBook.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {latestBook.chapterCount > 0
                      ? `${latestBook.chapterCount} chapters · ${formatNumber(latestBook.wordCount)} words`
                      : "Drafting in progress"}
                  </p>
                </div>
                <Link
                  href={`/app/books/${latestBook.id}/editor`}
                  className={buttonVariants({ size: "lg", className: "gap-2 shadow-sm shrink-0" })}
                >
                  <PenLine className="h-4 w-4" /> Continue Writing
                </Link>
              </div>
            </Card>
          )}

          {/* All Manuscripts Grid */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              All eBooks ({standardBooks.length})
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {standardBooks.map((book) => {
                const lang = getLanguage(book.language);
                return (
                  <Card key={book.id} className="flex flex-col justify-between p-5 transition-shadow hover:shadow-md">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <Badge tone="neutral">{lang.name}</Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {timeAgo(book.updatedAt)}
                        </span>
                      </div>
                      <h4 className="mt-3 font-bold text-foreground line-clamp-2 leading-snug">
                        {book.title}
                      </h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {book.chapterCount > 0
                          ? `${book.chapterCount} chapters · ${formatNumber(book.wordCount)} words`
                          : "No chapters yet"}
                      </p>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                      <Link
                        href={`/app/books/${book.id}/outline`}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        Outline
                      </Link>
                      <Link
                        href={`/app/books/${book.id}/editor`}
                        className={buttonVariants({ size: "sm", variant: "secondary", className: "gap-1.5" })}
                      >
                        <PenLine className="h-3.5 w-3.5 text-primary" /> Open Editor
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
