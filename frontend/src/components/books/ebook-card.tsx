"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { BOOK_TYPE_LABELS, type BookType } from "@ebook/shared";
import { EbookCover } from "./ebook-cover";
import { EbookStatusBadge, BOOK_STATUS_CONFIG } from "./ebook-status-badge";
import { EbookCardActions } from "./ebook-card-actions";
import type { BookSummary } from "@/lib/types";
import { timeAgo, formatNumber } from "@/lib/utils";

export { BOOK_STATUS_CONFIG as STATUS_META };

export function EbookCard({ book }: { book: BookSummary }) {
  const isColoring = book.bookType === "coloring_book";
  const bookHref = isColoring
    ? `/app/coloring-book/${book.id}/pages`
    : `/app/books/${book.id}/editor`;

  const pageCountText = isColoring
    ? `${book.chapterCount || 0} coloring pages`
    : `${book.pageCount || Math.max(1, Math.ceil((book.wordCount || 0) / 250))} pages · ${book.chapterCount} ch`;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-border/80 hover:shadow-xl">
      {/* Cover Image Container */}
      <Link href={bookHref} className="relative block overflow-hidden rounded-xl">
        <EbookCover book={book} size="md" />
      </Link>

      {/* Book Metadata & Title */}
      <div className="flex flex-1 flex-col pt-3">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={bookHref}
            className="flex-1 focus:outline-none"
            title={book.title}
          >
            <h3 className="line-clamp-2 text-sm font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
              {book.title}
            </h3>
          </Link>
          <EbookCardActions book={book} className="-mr-1 -mt-0.5 shrink-0" />
        </div>

        {/* Author Name */}
        {book.author && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground font-medium">
            by {book.author}
          </p>
        )}

        {/* Category & Status */}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <EbookStatusBadge status={book.status} archivedAt={book.archivedAt} />
          <span className="text-[11px] font-medium text-muted-foreground">
            {pageCountText}
          </span>
        </div>

        {/* Footer: Last edited date */}
        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 opacity-70" />
            Edited {timeAgo(book.updatedAt)}
          </span>
          <span className="text-[11px] font-medium text-muted-foreground/80">
            {BOOK_TYPE_LABELS[book.bookType as BookType] ?? "eBook"}
          </span>
        </div>
      </div>
    </div>
  );
}
