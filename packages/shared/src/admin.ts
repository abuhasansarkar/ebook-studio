import { z } from "zod";

/**
 * S13 — administration, support and operations contract.
 *
 * The roles, the permissions they carry, and the shapes of the operational
 * views. The backend enforces the roles; these types let the admin screen
 * show what is possible without the screen ever being the control.
 */

/** The roles an operator can hold. */
export const ADMIN_ROLES = ["support", "finance", "administrator"] as const;
export type AdminRole = typeof ADMIN_ROLES[number];

/**
 * The permissions a role carries.
 *
 * A permission is the unit of authority. A role is a bundle of them, so a
 * new capability can be granted to one role without changing the others.
 */
export const ADMIN_PERMISSIONS = [
  /** Read the operational views: users, books, jobs, deliveries. */
  "ops.read",
  /** Act on a user's account: suspend, restore, close. */
  "users.manage",
  /** Adjust a credit balance. Always requires a reason. */
  "credits.adjust",
  /** Read payments, subscriptions and the credit ledger. */
  "billing.read",
  /** Refund a payment. Always requires a reason. */
  "billing.refund",
  /** Retry or cancel a queued job through the service that owns it. */
  "jobs.intervene",
  /** Read delivery records and retry a failed delivery. */
  "deliveries.read",
  /** Answer a support request. */
  "support.reply",
  /** Grant and revoke roles. */
  "roles.manage",
  /** Take a backup and rehearse a restore. */
  "backup.manage",
  /** Read the audit trail. */
  "audit.read",
] as const;
export type AdminPermission = typeof ADMIN_PERMISSIONS[number];

/** The permissions each role carries. */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  // A support agent reads the operational views and answers customers. They
  // do not move money.
  support: ["ops.read", "users.manage", "deliveries.read", "support.reply"],
  // A finance agent reads and moves money, but does not change roles.
  finance: ["ops.read", "billing.read", "billing.refund", "credits.adjust", "audit.read"],
  // An administrator holds every permission.
  administrator: ADMIN_PERMISSIONS,
};

/** Whether a role carries a permission. */
export function roleHasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Whether any of the roles carries a permission. */
export function rolesAllow(
  roles: readonly AdminRole[],
  permission: AdminPermission,
): boolean {
  return roles.some((role) => roleHasPermission(role, permission));
}

/** The severity of an operational incident. */
export const INCIDENT_SEVERITIES = ["info", "warning", "critical"] as const;
export type IncidentSeverity = typeof INCIDENT_SEVERITIES[number];

/** The kinds of incident the product records. */
export const INCIDENT_KINDS = [
  "queue_backlog",
  "delivery_failed",
  "export_failed",
  "payment_failed",
  "reconciliation_gap",
  "lease_expired",
  "provider_error",
] as const;
export type IncidentKind = typeof INCIDENT_KINDS[number];

/** The request body for submitting a support request. */
export const supportRequestSchema = z.object({
  category: z.enum(["question", "bug", "billing", "account", "other"]).default("question"),
  subject: z.string().trim().min(4).max(200),
  message: z.string().trim().min(10).max(5000),
  /** Where the customer was when they hit the problem. */
  context: z.string().trim().max(500).optional(),
  email: z.string().email().max(320).optional(),
  /** The correlation id the client generated, so support can find the logs. */
  correlationId: z.string().trim().max(100).optional(),
}).strict();
export type SupportRequestInput = z.infer<typeof supportRequestSchema>;

/** The request body for an operator answering a support request. */
export const supportReplySchema = z.object({
  response: z.string().trim().min(1).max(5000),
}).strict();

/** The request body for adjusting a credit balance. */
export const creditAdjustmentSchema = z.object({
  userId: z.string().trim().min(1).max(64),
  /** The credits to add. A negative number takes credits away. */
  credits: z.number().int().refine((n) => n !== 0, "The adjustment must not be zero."),
  /** Why. Required, because it is what an operator reads later. */
  reason: z.string().trim().min(10).max(1000),
}).strict();

/** The request body for granting or revoking a role. */
export const roleChangeSchema = z.object({
  userId: z.string().trim().min(1).max(64),
  role: z.enum(ADMIN_ROLES),
  reason: z.string().trim().min(10).max(1000),
}).strict();

/** The request body for refunding a payment. */
export const refundSchema = z.object({
  paymentId: z.string().trim().min(1).max(64),
  reason: z.string().trim().min(10).max(1000),
}).strict();

/** The request body for an operator retrying or cancelling a job. */
export const jobInterventionSchema = z.object({
  jobId: z.string().trim().min(1).max(64),
  action: z.enum(["retry", "cancel"]),
  reason: z.string().trim().min(10).max(1000),
}).strict();
