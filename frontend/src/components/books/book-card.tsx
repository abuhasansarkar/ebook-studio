"use client";

import Link from "next/link";
import { BOOK_TYPE_LABELS, getLanguage, type BookStatus, type BookType } from "@ebook/shared";
import { Badge } from "@/components/ui/misc";
import type { BookSummary } from "@/lib/types";
import { formatNumber, timeAgo } from "@/lib/utils";

export const STATUS_META: Record<BookStatus, { label: string; tone: "neutral" | "primary" | "success" | "warning" | "danger" }> = {
  draft: { label: "Planning", tone: "neutral" },
  outline_ready: { label: "Outline ready", tone: "primary" },
  generating: { label: "Writing…", tone: "warning" },
  written: { label: "Written", tone: "success" },
  failed: { label: "Needs attention", tone: "danger" },
};

const COVER_TINTS = ["from-[#e8603c] to-[#f2a65a]", "from-[#3c6ee8] to-[#5ab4f2]", "from-[#2f9e6a] to-[#8fd18b]", "from-[#8a4fd4] to-[#d48ae8]", "from-[#1f1a17] to-[#6f655d]"];

function tintFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COVER_TINTS[h % COVER_TINTS.length];
}

export function BookCard({ book }: { book: BookSummary }) {
  const lang = getLanguage(book.language);
  const status = STATUS_META[book.status] ?? STATUS_META.draft;
  return (
    <Link href={`/app/books/${book.id}`} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className={`relative flex aspect-[4/3] flex-col justify-end bg-gradient-to-br p-5 text-white ${tintFor(book.id)}`}>
        <p lang={lang.code} dir={lang.dir} className="line-clamp-3 text-lg font-bold leading-snug drop-shadow-sm">
          {book.title}
        </p>
        <span className="absolute end-3 top-3">
          {book.archivedAt && <Badge tone="neutral" className="mr-1 bg-white/90">Archived</Badge>}
          <Badge tone={status.tone} className="bg-white/90">{status.label}</Badge>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-xs text-muted-foreground">
          {BOOK_TYPE_LABELS[book.bookType as BookType] ?? "eBook"} · {lang.name}
        </p>
        <p className="text-sm text-muted-foreground">
          {book.chapterCount > 0 ? `${book.chapterCount} chapters · ${formatNumber(book.wordCount)} words` : "No chapters yet"}
        </p>
        <p className="mt-auto pt-2 text-xs text-muted-foreground">Edited {timeAgo(book.updatedAt)}</p>
      </div>
    </Link>
  );
}
