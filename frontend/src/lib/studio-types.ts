import type {
  AdminPermission,
  AdminRole,
  DistributionDestination,
  DistributionMetadata,
  DistributionPackage,
  ListingFieldSpec,
  MarketingDraft,
  MarketingGraphic,
  MarketingGraphicTemplate,
  MarketingOutputType,
  MarketingTone,
  PackageCheck,
  PackageFile,
  PublishingState,
} from "@ebook/shared";

/**
 * The types the new screens use.
 *
 * They are re-exported from the shared package rather than restated, so the
 * screen and the API cannot drift apart.
 */

export type {
  AdminPermission,
  AdminRole,
  DistributionDestination,
  DistributionMetadata,
  DistributionPackage,
  ListingFieldSpec,
  MarketingDraft,
  MarketingGraphic,
  MarketingGraphicTemplate,
  MarketingOutputType,
  MarketingTone,
  PackageCheck,
  PackageFile,
  PublishingState,
};

/** The listing profile one destination publishes, as the API returns it. */
export interface ListingDestinationProfile {
  destination: DistributionDestination;
  fields: ListingFieldSpec[];
  royaltyRate: number;
  royaltyNote: string;
  source: string;
  taxHandling: "excluded" | "included" | "varies";
}

export type MarketingFlag = import("@ebook/shared").MarketingFlag;
export type MarketingDraftStatus = import("@ebook/shared").MarketingDraftStatus;

// ---------- S13 administration ----------

/** What the signed-in account is allowed to do. */
export interface AdminAuthority {
  roles: AdminRole[];
  permissions: AdminPermission[];
}

/** One entry of the audit trail. */
export interface AuditEntry {
  id: string;
  actor: { id: string; name: string; email: string } | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  outcome: string;
  details: Record<string, unknown>;
  requestId: string | null;
  createdAt: string;
}

/**
 * The operational dashboard.
 *
 * The field names match the dashboard the backend computes. Each figure
 * carries its own period; `users.newInRange` and `credits.netInRange` cover
 * the last 24 hours, while the totals are all-time.
 */
export interface OperationsDashboard {
  generatedAt: string;
  range: string;
  users: { total: number; newInRange: number };
  books: { live: number };
  jobs: { active: number; failed: number; queuedOlderThanLimit: number; queueAgeLimitMinutes: number };
  exports: { ready: number; failed: number };
  payments: { succeeded: number; failed: number };
  deliveries: { failed: number };
  credits: { netInRange: number };
  incidents: { unresolved: number };
  support: { open: number };
  lastAuditAt: string | null;
  lastAuditAction: string | null;
}

/** One row of the operational user list. */
export interface OpsUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  bookCount: number;
  creditBalance: number;
  roles: AdminRole[];
}

/** One row of the operational book list. */
export interface OpsBook {
  id: string;
  title: string;
  ownerId: string;
  ownerEmail: string;
  status: string;
  chapterCount: number;
  exportCount: number;
  createdAt: string;
}

/** One row of the operational job list. */
export interface OpsJob {
  id: string;
  status: string;
  type: string;
  bookId: string;
  bookTitle: string | null;
  ownerId: string | null;
  progress: number;
  total: number;
  creditsReserved: number;
  creditsCharged: number;
  error: string | null;
  cancelRequested: boolean;
  /** When the worker's claim on a running job lapses; a lapsed claim is recovered. */
  leaseExpiresAt: string | null;
  /** Times the job was handed to the queue. */
  dispatchAttempts: number;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One row of the operational payment list. */
export interface OpsPayment {
  id: string;
  userId: string;
  customerEmail: string | null;
  planName: string | null;
  provider: string;
  amountMinor: number;
  currency: string;
  status: string;
  credits: number;
  createdAt: string;
}

/** An operational incident. */
export interface Incident {
  id: string;
  kind: string;
  severity: string;
  summary: string;
  subjectType: string | null;
  subjectId: string | null;
  createdAt: string;
}

/** An alert delivery. */
export interface AlertDelivery {
  id: string;
  kind: string;
  severity: string;
  summary: string;
  destination: string;
  status: string;
  error: string | null;
  createdAt: string;
}

/** A support request as an operator sees it. */
export interface SupportRequest {
  id: string;
  userId: string | null;
  customerEmail: string | null;
  correlationId: string;
  category: string;
  subject: string;
  message: string;
  context: string | null;
  status: string;
  response: string | null;
  createdAt: string;
}

/** A backup manifest. */
export interface BackupManifest {
  id: string;
  name: string;
  bytes: number;
  databaseSha256: string;
  assetsSha256: string | null;
  assetsCaptured: boolean;
  counts: Record<string, number>;
  restoredAt: string | null;
  restoredInto: string | null;
  restoreVerified: boolean;
  restoreNotes: string | null;
  createdAt: string;
}

/** The result of rehearsing a restore. */
export interface RestoreRehearsal {
  name: string;
  targetDatabase: string;
  verified: boolean;
  observed: Record<string, number>;
  expected: Record<string, number>;
  notes: string;
  databaseSha256: string;
}

// ---------- S14 distribution ----------

/** A destination and the rules it applies. */
export interface DestinationProfile {
  destination: DistributionDestination;
  required: ("pdf" | "epub" | "docx")[];
  accepted: ("pdf" | "epub" | "docx")[];
  cover: ("jpeg" | "png")[];
  coverRequired: boolean;
  maxFileBytes: number;
  maxPackageBytes: number;
  wantsMetadataFile: boolean;
  wantsSource: boolean;
}

/** The author's publishing status for a destination. */
export interface PublishingStatus {
  destination: DistributionDestination;
  state: PublishingState;
  externalReference: string | null;
  note: string | null;
  updatedAt: string;
}

// ---------- S15 marketing ----------

/** One of the output types the studio can draft, and what it costs. */
export interface MarketingOutput {
  outputType: MarketingOutputType;
  label: string;
  credits: number;
  isList: boolean;
}
