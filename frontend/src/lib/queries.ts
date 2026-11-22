"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BookBrief, BookBriefInput, Operation, Outline } from "@ebook/shared";
import { operationRequest } from "./operation-request";
import { api } from "./api";
import { useSession } from "./auth-client";
import type {
  AccountUser,
  BillingState,
  BookDetail,
  BookSummary,
  ChapterFull,
  ChapterMeta,
  CheckoutSession,
  CreditTransaction,
  Dashboard,
  ExportRecord,
  ExportFormat,
  GenerationJob,
  HealthStatus,
  LiveStatus,
  OutlineRecord,
  Payment,
  PlanCatalog,
  ReadyStatus,
} from "./types";

export const qk = {
  dashboard: ["dashboard"] as const,
  books: (search?: string) => ["books", search ?? ""] as const,
  book: (id: string) => ["book", id] as const,
  chapters: (bookId: string) => ["chapters", bookId] as const,
  chapter: (id: string) => ["chapter", id] as const,
  exports: (bookId: string) => ["exports", bookId] as const,
  credits: ["credits"] as const,
  plans: ["billing-plans"] as const,
  billing: ["billing"] as const,
  payments: ["billing-payments"] as const,
  config: ["config"] as const,
  operation: (id: string) => ["operation", id] as const,
  generationJob: (id: string) => ["generation-job", id] as const,
  account: ["account"] as const,
  health: ["health"] as const,
  readiness: ["health-ready"] as const,
  liveness: ["health-live"] as const,
};

/**
 * Whether the signed-in account is known.
 *
 * Every account-scoped query waits for this. A query that runs before the
 * session is known fetches without a session on the server, so it fails there
 * and succeeds in the browser: the two render different markup and the page
 * reports a hydration mismatch. Waiting for the session makes both renders
 * agree, because the query only starts once the account is known.
 */
export function useIsSignedIn(): boolean {
  const { data: session, isPending } = useSession();
  return !isPending && Boolean(session?.user);
}

/**
 * One operation, by id.
 *
 * The list is enough for the activity strip, but a support reference the
 * customer quotes is looked up on its own so the state shown is the live one.
 */
export function useOperation(operationId: string | null) {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: qk.operation(operationId ?? "none"),
    queryFn: () => api.get<{ operation: Operation }>(`/operations/${operationId}`).then((r) => r.operation),
    enabled: signedIn && Boolean(operationId),
  });
}

export function usePublicConfig() {
  return useQuery({
    queryKey: qk.config,
    queryFn: () => api.get<{ auth: { google: boolean } }>("/config"),
    staleTime: Infinity,
  });
}

/**
 * One generation job, by id.
 *
 * The book's own detail carries the active and last job, but a job keeps
 * running after the page is closed, so its progress is read from the job
 * record itself while it is being watched.
 */
export function useGenerationJob(jobId: string | null) {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: qk.generationJob(jobId ?? "none"),
    queryFn: () => api.get<{ job: GenerationJob }>(`/generation-jobs/${jobId}`).then((r) => r.job),
    enabled: signedIn && Boolean(jobId),
  });
}

export function useDashboard() {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: qk.dashboard,
    queryFn: () => api.get<Dashboard>("/users/me/dashboard"),
    enabled: signedIn,
  });
}

export function useBooks(search?: string) {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: qk.books(search),
    queryFn: () => api.get<{ books: BookSummary[] }>(`/books${search ? `?search=${encodeURIComponent(search)}` : ""}`).then((r) => r.books),
    enabled: signedIn,
  });
}

/** Polls while a job is active so progress is live. */
export function useBook(bookId: string) {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: qk.book(bookId),
    queryFn: () => api.get<{ book: BookDetail }>(`/books/${bookId}`).then((r) => r.book),
    refetchInterval: (q) => (q.state.data?.activeJob ? 1500 : false),
    enabled: signedIn && Boolean(bookId),
  });
}

export function useChapters(bookId: string, poll = false) {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: qk.chapters(bookId),
    queryFn: () => api.get<{ chapters: ChapterMeta[] }>(`/books/${bookId}/chapters`).then((r) => r.chapters),
    refetchInterval: poll ? 3000 : false,
    enabled: signedIn && Boolean(bookId),
  });
}

export function useChapter(chapterId: string | null) {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: qk.chapter(chapterId ?? "none"),
    queryFn: () => api.get<{ chapter: ChapterFull }>(`/chapters/${chapterId}`).then((r) => r.chapter),
    enabled: signedIn && Boolean(chapterId),
    // The editor owns the document while open; never clobber it with a background refetch.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useExports(bookId: string) {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: qk.exports(bookId),
    queryFn: () => api.get<{ exports: ExportRecord[] }>(`/books/${bookId}/exports`).then((r) => r.exports),
    refetchInterval: (q) => (q.state.data?.some((e) => e.status === "queued" || e.status === "processing") ? 1500 : false),
    // The screen can be opened before a book is chosen. Asking for the
    // exports of no book would be a request to a path with no id in it, so
    // the query waits until there is a book to ask about.
    enabled: signedIn && Boolean(bookId),
  });
}

export function useCredits() {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: qk.credits,
    queryFn: () => api.get<{ wallet: { balance: number; reserved: number }; transactions: CreditTransaction[]; nextCursor?: string | null }>("/credits"),
    enabled: signedIn,
  });
}

// ---------- Billing (S12) ----------

export function usePlans() {
  return useQuery({
    queryKey: qk.plans,
    queryFn: () => api.get<PlanCatalog>("/billing/plans"),
    staleTime: 60_000,
  });
}

export function useBilling() {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: qk.billing,
    queryFn: () => api.get<BillingState>("/billing"),
    enabled: signedIn,
  });
}

/**
 * Starts a checkout.
 *
 * The checkout only creates a pending payment. Nothing is granted until the
 * provider sends a verified payment event, so the browser cannot grant
 * credits by itself.
 */
export function useStartCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => api.post<{ checkout: CheckoutSession }>("/billing/checkout", { planId }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.billing });
      void qc.invalidateQueries({ queryKey: qk.credits });
    },
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ subscription: BillingState["subscription"] }>("/billing/cancel"),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.billing });
      void qc.invalidateQueries({ queryKey: qk.credits });
    },
  });
}

export function useSyncBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<BillingState>("/billing/sync"),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.billing });
      void qc.invalidateQueries({ queryKey: qk.credits });
      void qc.invalidateQueries({ queryKey: qk.payments });
    },
  });
}

/**
 * The author's payment history, on its own.
 *
 * This is the scoped payment list rather than the one nested inside the
 * billing state, so it is read on its own whenever the payments screen is
 * opened, and refreshed on its own after a checkout or a cancellation.
 */
export function usePayments() {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: qk.payments,
    queryFn: () => api.get<{ payments: Payment[] }>("/billing/payments").then((r) => r.payments),
    enabled: signedIn,
  });
}

// ---------- The account ----------

/**
 * The signed-in account, as the product's own account endpoint reports it.
 *
 * The auth session says who is signed in. This says what the product knows
 * about that account — including whether the address is verified — so the
 * profile screen does not have to infer it from a session cookie.
 */
export function useAccount() {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: qk.account,
    queryFn: () => api.get<{ user: AccountUser }>("/users/me").then((r) => r.user),
    enabled: signedIn,
  });
}

// ---------- Service health ----------

/**
 * The liveness probe.
 *
 * The probe is public, so it answers even when the session is not. It says the
 * process is up; it says nothing about whether the dependencies are healthy.
 */
export function useLiveness() {
  return useQuery({
    queryKey: qk.liveness,
    queryFn: () => api.get<LiveStatus>("/health/live"),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  });
}

/**
 * The readiness probe.
 *
 * Each dependency is reported separately, so a degraded service can say which
 * one is unavailable rather than only that something is wrong.
 */
export function useReadiness() {
  return useQuery({
    queryKey: qk.readiness,
    queryFn: () => api.get<ReadyStatus>("/health/ready"),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  });
}

/**
 * The general health check.
 *
 * It covers the database and the queue. The readiness probe covers more, so
 * this is the one to read when the service is up but something is slow.
 */
export function useHealth() {
  return useQuery({
    queryKey: qk.health,
    queryFn: () => api.get<HealthStatus>("/health"),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  });
}

// ---------- Mutations ----------
function useInvalidateBook(bookId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["operations", bookId] });
    void qc.invalidateQueries({ queryKey: qk.book(bookId) });
    void qc.invalidateQueries({ queryKey: qk.chapters(bookId) });
    void qc.invalidateQueries({ queryKey: qk.credits });
    void qc.invalidateQueries({ queryKey: qk.dashboard });
    void qc.invalidateQueries({ queryKey: ["books"] });
  };
}

export function useCreateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (brief: BookBriefInput) =>
      operationRequest<{ book: BookSummary; job: GenerationJob | null; outlineError: { code: string; message: string } | null }>("/books", { brief }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["books"] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: qk.credits });
    },
  });
}

export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookId: string) => api.delete(`/books/${bookId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["books"] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useBookAction(bookId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateBook(bookId);
  return {
    generateOutline: useMutation({ mutationFn: () => operationRequest(`/books/${bookId}/outline/generate`), onSettled: invalidate }),
    saveOutline: useMutation({
      mutationFn: (o: Outline & { baseVersion: number }) => api.put<{ outline: OutlineRecord }>(`/books/${bookId}/outline`, o),
      // Write the saved outline into the book cache before anything re-renders, so
      // the outline screen never reloads the previous version (whose number would
      // make the next save fail with a conflict) while the refetch is in flight.
      onSuccess: ({ outline }) => {
        if (!outline || typeof outline.version !== "number") return;
        qc.setQueryData<BookDetail>(qk.book(bookId), (b) => (b ? { ...b, title: outline.data?.title ?? b.title, subtitle: outline.data?.subtitle ?? b.subtitle, outline } : b));
      },
      onSettled: invalidate,
    }),
    approveOutline: useMutation({ mutationFn: (version: number) => api.post(`/books/${bookId}/outline/approve`, { version }), onSettled: invalidate }),
    startGeneration: useMutation({ mutationFn: () => operationRequest<{ job: GenerationJob }>(`/books/${bookId}/generate`), onSettled: invalidate }),
    cancelGeneration: useMutation({ mutationFn: () => api.post(`/books/${bookId}/generate/cancel`), onSettled: invalidate }),
  };
}

/** Puts the book's chapters in a new order (every chapter, each once). */
export function useReorderChapters(bookId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateBook(bookId);
  return useMutation({
    mutationFn: (chapterIds: string[]) => api.put<{ chapters: { id: string; position: number }[] }>(`/books/${bookId}/chapters/order`, { chapterIds }),
    // Single-chapter caches never refetch on their own (the editor owns them), so
    // patch their positions here or the editor keeps showing the old "Chapter N".
    onSuccess: (res, chapterIds) => {
      const positions = new Map<string, number>(res?.chapters?.length ? res.chapters.map((c) => [c.id, c.position]) : chapterIds.map((id, index) => [id, index]));
      for (const [id, position] of positions) {
        qc.setQueryData<ChapterFull>(qk.chapter(id), (c) => (c && c.position !== position ? { ...c, position } : c));
      }
      qc.setQueryData<ChapterMeta[]>(qk.chapters(bookId), (list) =>
        list?.map((c) => (positions.has(c.id) ? { ...c, position: positions.get(c.id)! } : c)).sort((a, b) => a.position - b.position),
      );
    },
    onSettled: invalidate,
  });
}

/**
 * Saves the book brief. The server refuses while a job is running and once any
 * chapter has been written, because the brief is what the writing was based on.
 */
export function useUpdateBrief(bookId: string) {
  const invalidate = useInvalidateBook(bookId);
  return useMutation({
    mutationFn: (brief: BookBriefInput) => api.put<{ brief: BookBrief }>(`/books/${bookId}/brief`, brief).then((r) => r.brief),
    onSettled: invalidate,
  });
}

export function useCreateExport(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { format: ExportFormat; options?: Record<string, unknown> }) =>
      operationRequest<{ export: ExportRecord }>(`/books/${bookId}/exports`, { format: input.format, options: input.options }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: qk.exports(bookId) }); void qc.invalidateQueries({ queryKey: ["operations", bookId] }); },
  });
}

/** The formats this server can produce. */
export function useExportFormats() {
  return useQuery({
    queryKey: ["export-formats"],
    queryFn: () => api.get<{ formats: { format: ExportFormat; label: string; contentType: string }[] }>("/exports/formats").then((r) => r.formats),
    staleTime: Infinity,
  });
}
