import type { BookBrief, BookStatus, ChapterStatus, ExportFormat, ExportValidation, JobStatus, Outline, CoverDesign } from "@ebook/shared";

export type { ExportFormat };

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
  pageCount?: number | null;
  author?: string | null;
  authorName?: string | null;
  topic?: string | null;
  coverArtworkId?: string | null;
  coverVersion?: number | null;
  coverDesign?: { version: number; data: CoverDesign } | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationJob {
  id: string;
  bookId: string;
  type: "outline" | "chapters" | "image";
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
  format: ExportFormat;
  status: "queued" | "processing" | "ready" | "failed";
  fileSize: number | null;
  pageCount: number | null;
  error: string | null;
  /** Design version frozen when the export was requested (0 = default design); null before S08. */
  designVersion: number | null;
  /** MIME type of the stored file. */
  contentType: string | null;
  /** SHA-256 of the stored file; the download must match it. */
  sha256: string | null;
  diagnostics: { notes: string[]; glyphs: { role: string; count: number; characters: { char: string; codepoint: string }[] }[]; foreignFonts: string[]; overflow: string[]; type3Fonts: string[] } | null;
  /** Result of validating the file that was read back from storage. */
  validation: ExportValidation | null;
  /** What the file was made from, as captured when it was requested. */
  summary: { title: string; author: string; chapters: number; hasCover: boolean; requestedAt: string } | null;
  /** The manuscript has changed since this file was made. */
  stale: boolean;
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

// ---------- Billing (S12) ----------

export type { Plan, Subscription, Payment, PaymentCurrency, PaymentStatus, SubscriptionStatus, EntitlementKey, CheckoutSession, BillingState } from "@ebook/shared";

import type { Plan } from "@ebook/shared";

export interface PlanCatalog {
  plans: Plan[];
  /** The provider this build talks to. */
  provider: string;
  /** False when the provider cannot take money, as with the local one. */
  providerLive: boolean;
}

/**
 * The signed-in account, as the product's own account endpoint reports it.
 *
 * This is the server's authoritative view of the account. It is not the auth
 * session: the session says who is signed in, and this says what the product
 * knows about that account.
 */
export interface AccountUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

/**
 * The readiness of the service, as the health endpoint reports it.
 *
 * Each check is a separate dependency. A false check means that dependency is
 * not available right now, not that the product is broken.
 */
export interface ReadinessChecks {
  database: boolean;
  redis: boolean;
  workers: boolean;
  storage: boolean;
}

/** The liveness probe: the process is up and serving. */
export interface LiveStatus {
  status: "alive";
}

/** The readiness probe: the dependencies are all available. */
export interface ReadyStatus {
  status: "ready" | "degraded";
  checks: ReadinessChecks;
}

/** The general health check: the database and the queue are reachable. */
export interface HealthStatus {
  status: "ok" | "degraded";
  checks: { database: boolean; redis: boolean };
}
