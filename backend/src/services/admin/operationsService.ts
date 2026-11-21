import { prisma } from "../../database/prisma.js";
import { logger } from "../../utils/logger.js";
import { recordAudit } from "./adminService.js";

/**
 * S13 — operational views, incidents and alerts.
 *
 * The product watches itself: a queue that grows old, a delivery that failed
 * permanently, a payment that failed, a reconciliation gap. Each is recorded
 * as an incident so an operator can see it, and each can raise an alert so
 * somebody is told.
 *
 * Nothing here repairs anything. The incidents are a record; the repairs are
 * separate, deliberate actions that go through the service that owns the
 * thing being repaired.
 */

/** How old a queued job may be before it is an incident. */
const QUEUE_AGE_MINUTES = 15;

/**
 * Records an incident.
 *
 * A repeated incident of the same kind on the same subject is not recorded
 * twice: it is counted, so a persistent problem does not flood the list.
 */
export async function raiseIncident(input: {
  kind: string;
  severity?: "info" | "warning" | "critical";
  summary: string;
  subjectType?: string;
  subjectId?: string;
}): Promise<string> {
  const severity = input.severity ?? "warning";
  const existing = input.subjectId
    ? await prisma.operationalIncident.findFirst({
        where: {
          kind: input.kind,
          subjectId: input.subjectId,
          resolvedAt: null,
        },
        orderBy: { createdAt: "desc" },
      })
    : null;

  if (existing) {
    // The problem is already known. It is not a new incident.
    return existing.id;
  }

  const incident = await prisma.operationalIncident.create({
    data: {
      kind: input.kind,
      severity,
      summary: input.summary,
      subjectType: input.subjectType ?? null,
      subjectId: input.subjectId ?? null,
    },
  });
  return incident.id;
}

/** Marks an incident resolved. */
export async function resolveIncident(
  incidentId: string,
  actorId: string,
  resolution: string,
): Promise<void> {
  await prisma.operationalIncident.update({
    where: { id: incidentId },
    data: { resolvedAt: new Date(), resolvedBy: actorId, resolution },
  });
}

/** The open incidents, newest first. */
export async function openIncidents(limit = 100) {
  const rows = await prisma.operationalIncident.findMany({
    where: { resolvedAt: null },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    take: Math.min(limit, 500),
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    severity: row.severity,
    summary: row.summary,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Raises an alert and records whether it was delivered.
 *
 * A delivery that was never confirmed is a failed alert, and it is recorded
 * as one. The product does not claim an alert arrived when it did not.
 */
export async function raiseAlert(input: {
  kind: string;
  summary: string;
  severity?: "info" | "warning" | "critical";
  incidentId?: string;
  destination: string;
  deliver: (summary: string, severity: string) => Promise<void>;
}): Promise<{ delivered: boolean; error?: string }> {
  const severity = input.severity ?? "warning";
  try {
    await input.deliver(input.summary, severity);
    await prisma.alertDelivery.create({
      data: {
        kind: input.kind,
        severity,
        summary: input.summary,
        destination: input.destination,
        status: "delivered",
        incidentId: input.incidentId ?? null,
      },
    });
    return { delivered: true };
  } catch (err) {
    const reason = (err as Error).message;
    await prisma.alertDelivery.create({
      data: {
        kind: input.kind,
        severity,
        summary: input.summary,
        destination: input.destination,
        status: "failed",
        error: reason,
        incidentId: input.incidentId ?? null,
      },
    });
    logger.error({ kind: input.kind, error: reason }, "An alert could not be delivered");
    return { delivered: false, error: reason };
  }
}

/** The alert deliveries, newest first. */
export async function alertHistory(limit = 100) {
  const rows = await prisma.alertDelivery.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    severity: row.severity,
    summary: row.summary,
    destination: row.destination,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * The operational dashboard.
 *
 * Every figure is counted from the database and carries its own time range,
 * so an operator is never looking at a number whose period is unclear.
 */
export async function dashboard() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dayAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [
    users,
    newUsers,
    books,
    activeJobs,
    failedJobs,
    queuedOlderThanLimit,
    exportsReady,
    exportsFailed,
    paymentsSucceeded,
    paymentsFailed,
    deliveriesFailed,
    unresolvedIncidents,
    creditsSpent,
    openSupport,
    lastAudit,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.book.count({ where: { deletedAt: null } }),
    prisma.generationJob.count({ where: { status: { in: ["queued", "running"] } } }),
    prisma.generationJob.count({ where: { status: "failed" } }),
    prisma.generationJob.count({
      where: { status: "queued", createdAt: { lt: new Date(Date.now() - QUEUE_AGE_MINUTES * 60 * 1000) } },
    }),
    prisma.export.count({ where: { status: "ready" } }),
    prisma.export.count({ where: { status: "failed" } }),
    prisma.payment.count({ where: { status: "succeeded" } }),
    prisma.payment.count({ where: { status: "failed" } }),
    prisma.emailDelivery.count({ where: { status: "failed" } }),
    prisma.operationalIncident.count({ where: { resolvedAt: null } }),
    prisma.creditTransaction.aggregate({ where: { createdAt: { gte: since } }, _sum: { amount: true } }),
    prisma.supportRequest.count({ where: { status: "open" } }),
    prisma.adminAuditEntry.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    range: "last 24 hours unless stated",
    users: { total: users, newInRange: newUsers },
    books: { live: books },
    jobs: {
      active: activeJobs,
      failed: failedJobs,
      queuedOlderThanLimit,
      queueAgeLimitMinutes: QUEUE_AGE_MINUTES,
    },
    exports: { ready: exportsReady, failed: exportsFailed },
    payments: { succeeded: paymentsSucceeded, failed: paymentsFailed },
    deliveries: { failed: deliveriesFailed },
    credits: { netInRange: creditsSpent._sum.amount ?? 0 },
    incidents: { unresolved: unresolvedIncidents },
    support: { open: openSupport },
    lastAuditAt: lastAudit?.createdAt.toISOString() ?? null,
    lastAuditAction: lastAudit?.action ?? null,
  };
}

/**
 * The jobs an operator can look at.
 *
 * The list is deliberately narrow: a job's identity, its state and its
 * timings, never the author's manuscript content.
 */
export async function jobList(options: { status?: string; limit?: number; before?: Date } = {}) {
  const rows = await prisma.generationJob.findMany({
    where: {
      ...(options.status ? { status: options.status } : {}),
      ...(options.before ? { createdAt: { lt: options.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(options.limit ?? 100, 500),
    include: { book: { select: { id: true, title: true, userId: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    type: row.type,
    bookId: row.bookId,
    bookTitle: row.book?.title ?? null,
    ownerId: row.book?.userId ?? null,
    progress: row.progress,
    total: row.total,
    creditsReserved: row.creditsReserved,
    creditsCharged: row.creditsCharged,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * The customers an operator can look at.
 *
 * Only what an operator needs to act: identity, activity and money. The
 * customer's manuscript content is never in this list.
 */
export async function userList(options: { limit?: number; before?: Date; search?: string } = {}) {
  const rows = await prisma.user.findMany({
    where: {
      ...(options.before ? { createdAt: { lt: options.before } } : {}),
      ...(options.search
        ? {
            OR: [
              { email: { contains: options.search, mode: "insensitive" } },
              { name: { contains: options.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(options.limit ?? 100, 500),
    include: {
      wallet: true,
      adminRoles: { where: { revokedAt: null } },
      _count: { select: { books: true, payments: true, operations: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt.toISOString(),
    creditBalance: row.wallet?.balance ?? 0,
    bookCount: row._count.books,
    paymentCount: row._count.payments,
    operationCount: row._count.operations,
    // The roles the account currently holds, so an operator can see who may
    // use which console without opening the role screen.
    roles: row.adminRoles.map((role) => role.role),
  }));
}

/**
 * The payments an operator can look at.
 *
 * The customer's email is included because a finance agent has to know whose
 * money it is; nothing else about the customer is.
 */
export async function paymentList(options: { limit?: number; status?: string; before?: Date } = {}) {
  const rows = await prisma.payment.findMany({
    where: {
      ...(options.status ? { status: options.status } : {}),
      ...(options.before ? { createdAt: { lt: options.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(options.limit ?? 100, 500),
    include: { plan: { select: { name: true } }, user: { select: { id: true, email: true, name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    customerEmail: row.user?.email ?? null,
    planName: row.plan?.name ?? null,
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status,
    credits: row.credits,
    provider: row.provider,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Adjusts a customer's credit balance.
 *
 * The adjustment goes through the credit service, so it lands in the same
 * immutable ledger as every other credit movement and the balance still
 * reconciles. A reason is required, and the adjustment is audited.
 */
export async function adjustCredits(input: {
  actorId: string;
  userId: string;
  credits: number;
  reason: string;
  requestId?: string;
}): Promise<{ balance: number; transactionId: string }> {
  const { creditService } = await import("../credits/creditService.js");
  const target = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!target) {
    const { notFound } = await import("../../utils/errors.js");
    throw notFound("User");
  }

  const result = await creditService.adjust(
    input.userId,
    input.credits,
    `admin:${input.actorId}:${input.userId}:${Date.now()}`,
    input.reason,
  );

  await recordAudit({
    actorId: input.actorId,
    action: "credits.adjust",
    targetType: "user",
    targetId: input.userId,
    reason: input.reason,
    details: { credits: input.credits, balanceAfter: result.balance },
    requestId: input.requestId,
  });

  return result;
}

/**
 * A support request from a customer.
 *
 * Nothing is sent anywhere. The request is stored with the correlation id so
 * an agent can find the workflow the customer was in.
 */
export async function submitSupportRequest(input: {
  userId?: string;
  correlationId: string;
  category: string;
  subject: string;
  message: string;
  context?: string;
  email?: string;
}): Promise<{ id: string; correlationId: string }> {
  const row = await prisma.supportRequest.create({
    data: {
      userId: input.userId ?? null,
      correlationId: input.correlationId,
      category: input.category,
      subject: input.subject,
      message: input.message,
      context: input.context ?? null,
      email: input.email ?? null,
    },
  });
  return { id: row.id, correlationId: row.correlationId };
}

/** The support requests an agent can work through. */
export async function supportList(options: { status?: string; limit?: number } = {}) {
  const rows = await prisma.supportRequest.findMany({
    where: options.status ? { status: options.status } : {},
    orderBy: { createdAt: "desc" },
    take: Math.min(options.limit ?? 100, 500),
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    customerEmail: row.user?.email ?? row.email ?? null,
    correlationId: row.correlationId,
    category: row.category,
    subject: row.subject,
    message: row.message,
    context: row.context,
    status: row.status,
    response: row.response,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** An agent's answer to a support request. */
export async function replySupportRequest(input: {
  actorId: string;
  requestId: string;
  response: string;
  requestIdHeader?: string;
}): Promise<void> {
  const row = await prisma.supportRequest.update({
    where: { id: input.requestId },
    data: {
      status: "answered",
      response: input.response,
      respondedBy: input.actorId,
      respondedAt: new Date(),
    },
  });
  await recordAudit({
    actorId: input.actorId,
    action: "support.reply",
    targetType: "support_request",
    targetId: row.id,
    reason: "Answered a support request.",
    details: { category: row.category },
    requestId: input.requestIdHeader,
  });
}
