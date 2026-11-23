"use client";

import Link from "next/link";
import { Clock, BookOpen } from "lucide-react";
import { BOOK_TYPE_LABELS, type BookType } from "@ebook/shared";
import { EbookCover } from "./ebook-cover";
import { EbookStatusBadge } from "./ebook-status-badge";
import { EbookCardActions } from "./ebook-card-actions";
import type { BookSummary } from "@/lib/types";
import { timeAgo, formatNumber } from "@/lib/utils";

export function EbookListView({ books }: { books: BookSummary[] }) {
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      {books.map((book) => {
        const isColoring = book.bookType === "coloring_book";
        const bookHref = isColoring
          ? `/app/coloring-book/${book.id}/pages`
          : `/app/books/${book.id}/editor`;

        return (
          <div
            key={book.id}
            className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-muted/30 transition-colors"
          >
            {/* Left: Thumbnail & Titles */}
            <div className="flex items-center gap-4 min-w-0">
              <Link href={bookHref} className="shrink-0">
                <EbookCover book={book} size="sm" showOverlayText={false} className="shadow-sm" />
              </Link>
              <div className="min-w-0 space-y-1">
                <Link href={bookHref} className="focus:outline-none block">
                  <h3 className="line-clamp-1 text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                    {book.title}
                  </h3>
                </Link>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {book.author && <span>by {book.author}</span>}
                  {book.author && <span>•</span>}
                  <span>{BOOK_TYPE_LABELS[book.bookType as BookType] ?? "eBook"}</span>
                  <span>•</span>
                  <span>
                    {isColoring
                      ? `${book.chapterCount || 0} pages`
                      : `${book.chapterCount} chapters (${formatNumber(book.wordCount)} words)`}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Status, Timestamp & Actions */}
            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
              <EbookStatusBadge status={book.status} archivedAt={book.archivedAt} />
              <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                <Clock className="h-3 w-3 opacity-60" />
                {timeAgo(book.updatedAt)}
              </span>
              <EbookCardActions book={book} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
