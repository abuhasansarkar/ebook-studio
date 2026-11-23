"use client";

import { EbookCard } from "./ebook-card";
import { BOOK_STATUS_CONFIG } from "./ebook-status-badge";
import type { BookSummary } from "@/lib/types";

export const STATUS_META = BOOK_STATUS_CONFIG;

export function BookCard({ book }: { book: BookSummary }) {
  return <EbookCard book={book} />;
}
