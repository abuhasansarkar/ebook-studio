import type { BookBrief, BookStatus, ChapterStatus, JobStatus, Outline } from "@ebook/shared";

export interface BookSummary {
  projectId?: string | null;
  archivedAt?: string | null;
  id: string;
  title: string;
  subtitle: string;
  language: string;
  bookType: string;
  status: BookStatus;
  chapterCount: number;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationJob {
  id: string;
  bookId: string;
  type: "outline" | "chapters";
  status: JobStatus;
  progress: number;
  total: number;
  cancelRequested: boolean;
  savedSections?: number;
  recovering?: boolean;
  creditsReserved: number;
  creditsCharged: number;
  inputTokens: number;
  outputTokens: number;
  model: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ChapterMeta {
  id: string;
  position: number;
  title: string;
  goal?: string;
  status: ChapterStatus;
  wordCount: number;
  targetWords?: number;
  version: number;
  updatedAt: string;
}

export interface OutlineRecord {
  id: string;
  version: number;
  data: Outline;
  approvedAt: string | null;
  createdAt: string;
}

export interface BookDetail extends Omit<BookSummary, "chapterCount" | "wordCount"> {
  brief: BookBrief;
  outline: OutlineRecord | null;
  chapters: ChapterMeta[];
  activeJob: GenerationJob | null;
  lastJob: GenerationJob | null;
}

export interface ChapterFull extends ChapterMeta {
  bookId: string;
  contentJson: Record<string, unknown> | null;
  error: string | null;
  book: { id: string; language: string; title: string };
}

export interface ExportRecord {
  id: string;
  bookId: string;
  format: "pdf";
  status: "queued" | "processing" | "ready" | "failed";
  fileSize: number | null;
  pageCount: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface CreditTransaction {
  id: string;
  type: "grant" | "reserve" | "charge" | "release" | "refund";
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

export interface Dashboard {
  totals: { books: number; chapters: number; words: number };
  credits: { balance: number; reserved: number };
  recentBooks: BookSummary[];
}
