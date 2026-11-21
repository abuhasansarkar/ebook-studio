"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DistributionDestination,
  DistributionMetadata,
  ListingCopy,
  MarketingGraphicTemplate,
  MarketingOutputType,
  MarketingSample,
  MarketingTone,
  PublishingState,
  RoyaltyEstimate,
} from "@ebook/shared";
import { api } from "./api";
import type {
  AdminAuthority,
  AlertDelivery,
  AuditEntry,
  BackupManifest,
  DestinationProfile,
  Incident,
  ListingDestinationProfile,
  MarketingOutput,
  OpsBook,
  OpsJob,
  OpsPayment,
  OpsUser,
  OperationsDashboard,
  PublishingStatus,
  RestoreRehearsal,
  SupportRequest,
} from "./studio-types";

/**
 * The query hooks for the administration, distribution and marketing screens.
 *
 * The hooks are thin: they name the endpoint and say what to refresh when
 * something changes. Every permission is enforced on the server, so a screen
 * that shows a button the operator may not use is a display problem, never a
 * security one.
 */

export const studioQk = {
  authority: ["admin-me"] as const,
  opsDashboard: ["admin-dashboard"] as const,
  opsUsers: (search?: string) => ["admin-users", search ?? ""] as const,
  opsBooks: ["admin-books"] as const,
  opsJobs: ["admin-jobs"] as const,
  opsPayments: ["admin-payments"] as const,
  incidents: ["admin-incidents"] as const,
  alerts: ["admin-alerts"] as const,
  audit: (action?: string) => ["admin-audit", action ?? ""] as const,
  support: (status?: string) => ["admin-support", status ?? ""] as const,
  roles: ["admin-roles"] as const,
  backups: ["admin-backups"] as const,
  destinations: ["distribution-destinations"] as const,
  packages: (bookId: string) => ["distribution-packages", bookId] as const,
  publishingStatus: (bookId: string) => ["publishing-status", bookId] as const,
  marketingOutputs: ["marketing-outputs"] as const,
  marketingDrafts: (bookId: string) => ["marketing-drafts", bookId] as const,
  marketingGraphics: (bookId: string) => ["marketing-graphics", bookId] as const,
  marketingSamples: (bookId: string) => ["marketing-samples", bookId] as const,
  listingDestinations: ["listing-destinations"] as const,
  listings: (bookId: string) => ["listings", bookId] as const,
  listing: (listingId: string) => ["listing", listingId] as const,
};

// ---------- S13 administration ----------

/** The signed-in account's own roles and permissions. */
export function useAdminAuthority() {
  return useQuery({
    queryKey: studioQk.authority,
    queryFn: () => api.get<AdminAuthority>("/admin/me"),
    // The authority rarely changes and a wrong answer here hides controls, so
    // it is refetched when the window regains focus.
    staleTime: 30_000,
    retry: false,
  });
}

export function useOpsDashboard(enabled = true) {
  return useQuery({
    queryKey: studioQk.opsDashboard,
    queryFn: () => api.get<{ dashboard: OperationsDashboard }>("/admin/dashboard").then((r) => r.dashboard),
    enabled,
    retry: false,
  });
}

export function useOpsUsers(search: string | undefined, enabled = true) {
  return useQuery({
    queryKey: studioQk.opsUsers(search),
    queryFn: () =>
      api
        .get<{ users: OpsUser[] }>(`/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`)
        .then((r) => r.users),
    enabled,
    retry: false,
  });
}

export function useOpsBooks(enabled = true) {
  return useQuery({
    queryKey: studioQk.opsBooks,
    queryFn: () => api.get<{ books: OpsBook[] }>("/admin/books").then((r) => r.books),
    enabled,
    retry: false,
  });
}

export function useOpsJobs(enabled = true) {
  return useQuery({
    queryKey: studioQk.opsJobs,
    queryFn: () => api.get<{ jobs: OpsJob[] }>("/admin/jobs").then((r) => r.jobs),
    enabled,
    retry: false,
  });
}

export function useOpsPayments(enabled = true) {
  return useQuery({
    queryKey: studioQk.opsPayments,
    queryFn: () => api.get<{ payments: OpsPayment[] }>("/admin/payments").then((r) => r.payments),
    enabled,
    retry: false,
  });
}

export function useIncidents(enabled = true) {
  return useQuery({
    queryKey: studioQk.incidents,
    queryFn: () => api.get<{ incidents: Incident[] }>("/admin/incidents").then((r) => r.incidents),
    enabled,
    retry: false,
  });
}

export function useAlertDeliveries(enabled = true) {
  return useQuery({
    queryKey: studioQk.alerts,
    queryFn: () => api.get<{ alerts: AlertDelivery[] }>("/admin/alerts").then((r) => r.alerts),
    enabled,
    retry: false,
  });
}

export function useAuditTrail(action: string | undefined, enabled = true) {
  return useQuery({
    queryKey: studioQk.audit(action),
    queryFn: () =>
      api
        .get<{ entries: AuditEntry[] }>(`/admin/audit${action ? `?action=${encodeURIComponent(action)}` : ""}`)
        .then((r) => r.entries),
    enabled,
    retry: false,
  });
}

export function useSupportRequests(status: string | undefined, enabled = true) {
  return useQuery({
    queryKey: studioQk.support(status),
    queryFn: () =>
      api
        .get<{ requests: SupportRequest[] }>(`/admin/support${status ? `?status=${encodeURIComponent(status)}` : ""}`)
        .then((r) => r.requests),
    enabled,
    retry: false,
  });
}

export function useRoleHolders(enabled = true) {
  return useQuery({
    queryKey: studioQk.roles,
    queryFn: () =>
      api
        .get<{
          roles: string[];
          holders: { id: string; userId: string; user: { id: string; name: string; email: string }; role: string; reason: string; grantedAt: string }[];
        }>("/admin/roles"),
    enabled,
    retry: false,
  });
}

export function useBackups(enabled = true) {
  return useQuery({
    queryKey: studioQk.backups,
    queryFn: () => api.get<{ backups: BackupManifest[] }>("/admin/backups").then((r) => r.backups),
    enabled,
    retry: false,
  });
}

/** Grants or revokes a role. */
export function useRoleChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; role: string; reason: string; action: "grant" | "revoke" }) =>
      api.post(`/admin/roles/${input.action}`, { userId: input.userId, role: input.role, reason: input.reason }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.roles });
      void qc.invalidateQueries({ queryKey: studioQk.audit() });
      void qc.invalidateQueries({ queryKey: studioQk.opsUsers() });
    },
  });
}

/** Adjusts a customer's credit balance. */
export function useCreditAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; credits: number; reason: string }) =>
      api.post<{ balance: number; transactionId: string }>("/admin/credits/adjust", input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.audit() });
      void qc.invalidateQueries({ queryKey: studioQk.opsUsers() });
    },
  });
}

/** Answers a support request. */
export function useSupportReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { requestId: string; response: string }) =>
      api.post(`/admin/support/${input.requestId}/reply`, { response: input.response }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.support() });
      void qc.invalidateQueries({ queryKey: studioQk.audit() });
    },
  });
}

/** Resolves an operational incident. */
export function useResolveIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { incidentId: string; resolution: string }) =>
      api.post(`/admin/incidents/${input.incidentId}/resolve`, { resolution: input.resolution }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.incidents });
      void qc.invalidateQueries({ queryKey: studioQk.audit() });
    },
  });
}

/** Raises an operational alert. */
export function useRaiseAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: string; summary: string; severity: "info" | "warning" | "critical" }) =>
      api.post<{ incidentId: string; delivered: boolean; error?: string }>("/admin/alerts", input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.alerts });
      void qc.invalidateQueries({ queryKey: studioQk.incidents });
    },
  });
}

/**
 * Retries or cancels a queued job.
 *
 * The intervention goes through the service that owns the job, so the job's
 * credits are settled the same way a customer's own cancellation would settle
 * them.
 */
export function useJobIntervention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { jobId: string; action: "retry" | "cancel"; reason: string }) =>
      api.post("/admin/jobs/intervene", input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.opsJobs });
      void qc.invalidateQueries({ queryKey: studioQk.audit() });
    },
  });
}

/**
 * Refunds a payment.
 *
 * The refund takes the credits back and withdraws the capabilities the
 * payment granted, exactly as a refund from the provider would.
 */
export function useRefundPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { paymentId: string; reason: string }) => api.post("/admin/payments/refund", input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.opsPayments });
      void qc.invalidateQueries({ queryKey: studioQk.audit() });
    },
  });
}

/** Takes a backup. */
export function useCreateBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name?: string) => api.post<{ backup: BackupManifest }>("/admin/backups", name ? { name } : {}),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.backups });
      void qc.invalidateQueries({ queryKey: studioQk.audit() });
    },
  });
}

/**
 * Rehearses a restore.
 *
 * The rehearsal loads the dump into a separate database. It never touches the
 * live one, and the result says whether the counts matched.
 */
export function useRehearseRestore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<{ restore: RestoreRehearsal }>(`/admin/backups/${name}/restore`, {}),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.backups });
      void qc.invalidateQueries({ queryKey: studioQk.audit() });
    },
  });
}

// ---------- S14 distribution ----------

/** The destinations a package can be prepared for. */
export function useDestinations() {
  return useQuery({
    queryKey: studioQk.destinations,
    queryFn: () => api.get<{ destinations: DestinationProfile[] }>("/distribution/destinations").then((r) => r.destinations),
    staleTime: Infinity,
  });
}

/** The packages for a book. */
export function useDistributionPackages(bookId: string | null) {
  return useQuery({
    queryKey: studioQk.packages(bookId ?? ""),
    queryFn: () =>
      api
        .get<{ packages: import("@ebook/shared").DistributionPackage[] }>(`/distribution/books/${bookId}/packages`)
        .then((r) => r.packages),
    enabled: Boolean(bookId),
  });
}

/** Prepares a distribution package. */
export function usePreparePackage(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      destination: DistributionDestination;
      exportIds: string[];
      metadata: DistributionMetadata;
      includeCover: boolean;
    }) => api.post<{ package: import("@ebook/shared").DistributionPackage }>(`/distribution/books/${bookId}/packages`, input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.packages(bookId) });
    },
  });
}

/** The author's publishing status for a book. */
export function usePublishingStatus(bookId: string | null) {
  return useQuery({
    queryKey: studioQk.publishingStatus(bookId ?? ""),
    queryFn: () =>
      api.get<{ statuses: PublishingStatus[] }>(`/distribution/books/${bookId}/publishing-status`).then((r) => r.statuses),
    enabled: Boolean(bookId),
  });
}

/** Records the author's publishing status. */
export function useSetPublishingStatus(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { destination: DistributionDestination; state: PublishingState; externalReference?: string; note?: string }) =>
      api.post(`/distribution/books/${bookId}/publishing-status`, input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.publishingStatus(bookId) });
    },
  });
}

// ---------- S15 marketing ----------

/** The output types the studio can draft, and what each costs. */
export function useMarketingOutputs() {
  return useQuery({
    queryKey: studioQk.marketingOutputs,
    queryFn: () => api.get<{ outputs: MarketingOutput[] }>("/marketing/outputs").then((r) => r.outputs),
    staleTime: Infinity,
  });
}

/** The drafts for a book. */
export function useMarketingDrafts(bookId: string | null) {
  return useQuery({
    queryKey: studioQk.marketingDrafts(bookId ?? ""),
    queryFn: () =>
      api
        .get<{ drafts: import("@ebook/shared").MarketingDraft[] }>(`/marketing/books/${bookId}/drafts`)
        .then((r) => r.drafts),
    enabled: Boolean(bookId),
  });
}

/** Drafts a piece of marketing material. */
export function useCreateMarketingDraft(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { outputType: MarketingOutputType; tone: MarketingTone; audience?: string; instruction?: string }) =>
      api.post<{ draft: import("@ebook/shared").MarketingDraft }>(`/marketing/books/${bookId}/drafts`, input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.marketingDrafts(bookId) });
      void qc.invalidateQueries({ queryKey: ["credits"] });
    },
  });
}

/** Saves an edited draft. */
export function useSaveMarketingDraft(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { draftId: string; content: string; baseVersion?: number; approve?: boolean }) =>
      api.patch<{ draft: import("@ebook/shared").MarketingDraft }>(`/marketing/drafts/${input.draftId}`, {
        content: input.content,
        baseVersion: input.baseVersion,
        approve: input.approve ?? false,
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.marketingDrafts(bookId) });
    },
  });
}

/** Regenerates a draft into a new variant. */
export function useRegenerateMarketingDraft(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draftId: string) => api.post<{ draft: import("@ebook/shared").MarketingDraft }>(`/marketing/drafts/${draftId}/regenerate`, {}),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.marketingDrafts(bookId) });
      void qc.invalidateQueries({ queryKey: ["credits"] });
    },
  });
}

/** Composes a promotional graphic. */
export function useCreateMarketingGraphic(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      template: MarketingGraphicTemplate;
      headline: string;
      subhead?: string;
      callToAction?: string;
      textColor?: string;
      backgroundColor?: string;
      useCover?: boolean;
    }) => api.post<{ graphic: import("@ebook/shared").MarketingGraphic }>(`/marketing/books/${bookId}/graphics`, input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.marketingGraphics(bookId) });
    },
  });
}

/** The promotional graphics for a book. */
export function useMarketingGraphics(bookId: string | null) {
  return useQuery({
    queryKey: studioQk.marketingGraphics(bookId ?? ""),
    queryFn: () =>
      api
        .get<{ graphics: import("@ebook/shared").MarketingGraphic[] }>(`/marketing/books/${bookId}/graphics`)
        .then((r) => r.graphics),
    enabled: Boolean(bookId),
  });
}

/**
 * The sample chapter packs for a book.
 *
 * A sample is a downloadable file the author hands out themselves. Nothing is
 * sent anywhere.
 */
export function useMarketingSamples(bookId: string | null) {
  return useQuery({
    queryKey: studioQk.marketingSamples(bookId ?? ""),
    queryFn: () =>
      api.get<{ samples: MarketingSample[] }>(`/marketing/books/${bookId}/samples`).then((r) => r.samples),
    enabled: Boolean(bookId),
  });
}

/** Assembles a sample chapter pack from the chosen chapters. */
export function useCreateMarketingSample(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { chapterIds: string[]; format?: "pdf" | "epub" | "docx" }) =>
      api.post<{ sample: MarketingSample }>(`/marketing/books/${bookId}/samples`, input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioQk.marketingSamples(bookId) });
    },
  });
}

// ---------- Marketplace listing copy ----------

/** The listing fields each destination asks for, and its published rate. */
export function useListingDestinations() {
  return useQuery({
    queryKey: studioQk.listingDestinations,
    queryFn: () =>
      api
        .get<{ destinations: ListingDestinationProfile[] }>("/listings/destinations")
        .then((r) => r.destinations),
    staleTime: 5 * 60_000,
  });
}

/** The listings prepared for a book. */
export function useListings(bookId: string | null) {
  return useQuery({
    queryKey: studioQk.listings(bookId ?? ""),
    queryFn: () => api.get<{ listings: ListingCopy[] }>(`/listings/books/${bookId}`).then((r) => r.listings),
    enabled: Boolean(bookId),
  });
}

/** One listing, with the fields it is still missing and whether it is stale. */
export function useListing(listingId: string | null) {
  return useQuery({
    queryKey: studioQk.listing(listingId ?? ""),
    queryFn: () => api.get<{ listing: ListingCopy }>(`/listings/${listingId}`).then((r) => r.listing),
    enabled: Boolean(listingId),
  });
}

/**
 * Prepares a listing for a destination.
 *
 * The listing is drafted from the manuscript and is not submitted anywhere.
 */
export function usePrepareListing(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { destination: DistributionDestination; priceInMinorUnits: number }) =>
      api.post<{ listing: ListingCopy }>(`/listings/books/${bookId}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: studioQk.listings(bookId) });
    },
  });
}

/**
 * Saves an edited listing.
 *
 * The version is sent with the save, so a lost edit is refused rather than
 * overwriting a newer one.
 */
export function useUpdateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      listingId: string;
      baseVersion: number;
      priceInMinorUnits?: number;
      fields?: Record<string, string>;
      confirmed?: Record<string, boolean>;
    }) =>
      api.patch<{ listing: ListingCopy }>(`/listings/${input.listingId}`, {
        baseVersion: input.baseVersion,
        priceInMinorUnits: input.priceInMinorUnits,
        fields: input.fields,
        confirmed: input.confirmed,
      }),
    onSuccess: (result, input) => {
      void qc.invalidateQueries({ queryKey: studioQk.listing(input.listingId) });
      void qc.invalidateQueries({ queryKey: studioQk.listings(result.listing.bookId) });
    },
  });
}

/**
 * The royalty estimate for a price.
 *
 * A pure calculation on the server, so it costs nothing and the author can
 * move a price around freely.
 */
export function useRoyaltyQuote(destination: DistributionDestination | null, priceInMinorUnits: number) {
  return useQuery({
    queryKey: ["royalty-quote", destination, priceInMinorUnits] as const,
    queryFn: () =>
      api
        .post<{ quote: RoyaltyEstimate }>("/listings/royalty-quote", { destination, priceInMinorUnits })
        .then((r) => r.quote),
    enabled: Boolean(destination),
    // The answer only changes when the price or the destination does.
    staleTime: 60_000,
  });
}
