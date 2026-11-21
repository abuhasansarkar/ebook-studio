import {
  ADMIN_ROLES,
  ROLE_PERMISSIONS,
  roleHasPermission,
  type AdminPermission,
  type AdminRole,
} from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { forbidden, notFound } from "../../utils/errors.js";

/**
 * S13 — roles, permissions and the audit trail.
 *
 * The rule this module exists to enforce: a privileged action is decided by
 * the role the account holds on the server. The admin screen hides what an
 * operator may not do, but hiding a button is a courtesy, not a control —
 * every privileged route checks the role here.
 */

/** The roles an account currently holds, ignoring revoked ones. */
export async function rolesOf(userId: string): Promise<AdminRole[]> {
  const rows = await prisma.adminRole.findMany({
    where: { userId, revokedAt: null },
    select: { role: true },
  });
  return rows
    .map((row) => row.role)
    .filter((role): role is AdminRole => (ADMIN_ROLES as readonly string[]).includes(role));
}

/** The permissions an account currently holds. */
export async function permissionsOf(userId: string): Promise<AdminPermission[]> {
  const roles = await rolesOf(userId);
  const permissions = new Set<AdminPermission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) permissions.add(permission);
  }
  return [...permissions];
}

/** Whether an account holds a permission. */
export async function hasPermission(
  userId: string,
  permission: AdminPermission,
): Promise<boolean> {
  const roles = await rolesOf(userId);
  return roles.some((role) => roleHasPermission(role, permission));
}

/**
 * Requires a permission, or refuses the request.
 *
 * The refusal does not reveal what the account does hold, so a caller cannot
 * map the permission set by probing.
 */
export async function requirePermission(
  userId: string,
  permission: AdminPermission,
): Promise<AdminRole[]> {
  const roles = await rolesOf(userId);
  const allowed = roles.some((role) => roleHasPermission(role, permission));
  if (!allowed) {
    throw forbidden("You do not have permission to perform this action.", {
      permission,
    });
  }
  return roles;
}

/**
 * Grants a role.
 *
 * The grant is recorded with its reason and who made it, so an operator's
 * authority is always traceable.
 */
export async function grantRole(
  actorId: string,
  userId: string,
  role: AdminRole,
  reason: string,
  requestId?: string,
): Promise<void> {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw notFound("User");

  await prisma.adminRole.upsert({
    where: { userId_role: { userId, role } },
    create: { userId, role, reason, grantedBy: actorId },
    update: { revokedAt: null, revokedBy: null, revokeReason: null, reason, grantedBy: actorId, grantedAt: new Date() },
  });

  await recordAudit({
    actorId,
    actorRole: role,
    action: "roles.grant",
    targetType: "user",
    targetId: userId,
    reason,
    details: { role },
    requestId,
  });
}

/** Revokes a role. */
export async function revokeRole(
  actorId: string,
  userId: string,
  role: AdminRole,
  reason: string,
  requestId?: string,
): Promise<void> {
  const existing = await prisma.adminRole.findUnique({ where: { userId_role: { userId, role } } });
  if (!existing) throw notFound("Role");

  await prisma.adminRole.update({
    where: { userId_role: { userId, role } },
    data: { revokedAt: new Date(), revokedBy: actorId, revokeReason: reason },
  });

  await recordAudit({
    actorId,
    actorRole: role,
    action: "roles.revoke",
    targetType: "user",
    targetId: userId,
    reason,
    details: { role },
    requestId,
  });
}

/** What to record about a privileged action. */
export interface AuditInput {
  /** The operator. Null for a system action. */
  actorId?: string | null;
  /** The role the actor held at the time. */
  actorRole?: string | null;
  /** The action, for example `credits.adjust`. */
  action: string;
  /** The kind of thing acted on. */
  targetType: string;
  /** The thing acted on. */
  targetId: string;
  /** Why. */
  reason?: string;
  /** What happened. */
  outcome?: string;
  /** The before and after state, without secrets or personal content. */
  details?: Record<string, unknown>;
  requestId?: string | null;
  ipAddress?: string | null;
}

/**
 * Writes an audit entry.
 *
 * Audit entries are written, never edited and never deleted. The row records
 * who acted, on what, why, and what happened.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  await prisma.adminAuditEntry.create({
    data: {
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason ?? "",
      outcome: input.outcome ?? "ok",
      details: (input.details ?? {}) as object,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

/** The audit trail, newest first. */
export async function auditTrail(options: {
  limit?: number;
  action?: string;
  targetType?: string;
  targetId?: string;
  actorId?: string;
  before?: Date;
} = {}) {
  const rows = await prisma.adminAuditEntry.findMany({
    where: {
      ...(options.action ? { action: options.action } : {}),
      ...(options.targetType ? { targetType: options.targetType } : {}),
      ...(options.targetId ? { targetId: options.targetId } : {}),
      ...(options.actorId ? { actorId: options.actorId } : {}),
      ...(options.before ? { createdAt: { lt: options.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(options.limit ?? 100, 500),
    include: { actor: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    actor: row.actor ? { id: row.actor.id, name: row.actor.name, email: row.actor.email } : null,
    actorRole: row.actorRole,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    outcome: row.outcome,
    details: row.details as Record<string, unknown>,
    requestId: row.requestId,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * The people who hold a role.
 *
 * This is how an administrator bootstraps: an operator is given the role
 * through the API by an existing administrator, and the grant is recorded.
 */
export async function roleHolders(role: AdminRole) {
  const rows = await prisma.adminRole.findMany({
    where: { role, revokedAt: null },
    orderBy: { grantedAt: "desc" },
    include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      createdAt: row.user.createdAt.toISOString(),
    },
    role: row.role,
    reason: row.reason,
    grantedBy: row.grantedBy,
    grantedAt: row.grantedAt.toISOString(),
  }));
}
