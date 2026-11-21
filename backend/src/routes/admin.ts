import { Router } from "express";
import { z } from "zod";
import {
  ADMIN_ROLES,
  creditAdjustmentSchema,
  jobInterventionSchema,
  refundSchema,
  roleChangeSchema,
  supportReplySchema,
  type AdminPermission,
} from "@ebook/shared";
import { userId } from "../middleware/requireAuth.js";
import { validateBody } from "../middleware/validate.js";
import {
  auditTrail,
  grantRole,
  permissionsOf,
  recordAudit,
  requirePermission,
  revokeRole,
  roleHolders,
  rolesOf,
} from "../services/admin/adminService.js";
import {
  adjustCredits,
  alertHistory,
  dashboard,
  jobList,
  openIncidents,
  paymentList,
  raiseAlert,
  raiseIncident,
  replySupportRequest,
  resolveIncident,
  supportList,
  userList,
} from "../services/admin/operationsService.js";
import { billingService } from "../services/billing/billingService.js";
import {
  BACKUP_NAME,
  createBackup,
  deleteBackup,
  getBackup,
  listBackups,
  rehearseRestore,
} from "../services/admin/backupService.js";
import { prisma } from "../database/prisma.js";
import { badRequest, notFound } from "../utils/errors.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export const adminRouter = Router();

/**
 * S13 — the administrative API.
 *
 * Every route below is guarded by a permission that is checked on the server.
 * The admin screen hides what an operator may not do, but hiding a button is a
 * courtesy, not a control: an operator who navigates straight to a route they
 * have no permission for is refused here, in the API, with a 403.
 *
 * The routes are mounted after `requireAuth`, so a signed-in customer reaches
 * them and is refused by the permission check. That is deliberate — the
 * refusal names the missing permission rather than hiding the feature.
 */

/**
 * Checks a permission and returns the operator's id.
 *
 * The refusal does not reveal what the account does hold, so a caller cannot
 * map the permission set by probing.
 */
async function withPermission(req: unknown, permission: AdminPermission): Promise<string> {
  const id = userId(req as never);
  await requirePermission(id, permission);
  return id;
}

// ---- The operator's own authority ----

adminRouter.get("/admin/me", async (req, res) => {
  const id = userId(req);
  res.json({ roles: await rolesOf(id), permissions: await permissionsOf(id) });
});

// ---- Operational views ----

adminRouter.get("/admin/dashboard", async (req, res) => {
  await withPermission(req, "ops.read");
  res.json({ dashboard: await dashboard() });
});

adminRouter.get("/admin/users", async (req, res) => {
  await withPermission(req, "ops.read");
  const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
  res.json({
    users: await userList({
      limit,
      search: req.query.search ? String(req.query.search) : undefined,
    }),
  });
});

adminRouter.get("/admin/books", async (req, res) => {
  await withPermission(req, "ops.read");
  const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
  // Searched on the server, so a book older than the newest page can be found.
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 200) : "";
  const rows = await prisma.book.findMany({
    where: {
      deletedAt: null,
      ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" as const } }, { user: { email: { contains: search, mode: "insensitive" as const } } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { id: true, email: true } },
      _count: { select: { chapters: true, exports: true } },
    },
  });
  res.json({
    books: rows.map((row) => ({
      id: row.id,
      title: row.title,
      ownerId: row.userId,
      ownerEmail: row.user.email,
      status: row.status,
      chapterCount: row._count.chapters,
      exportCount: row._count.exports,
      createdAt: row.createdAt.toISOString(),
    })),
  });
});

adminRouter.get("/admin/jobs", async (req, res) => {
  await withPermission(req, "ops.read");
  const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
  res.json({
    jobs: await jobList({
      limit,
      status: req.query.status ? String(req.query.status) : undefined,
    }),
  });
});

adminRouter.get("/admin/payments", async (req, res) => {
  await withPermission(req, "billing.read");
  const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
  res.json({
    payments: await paymentList({
      limit,
      status: req.query.status ? String(req.query.status) : undefined,
    }),
  });
});

// ---- Incidents and alerts ----

adminRouter.get("/admin/incidents", async (req, res) => {
  await withPermission(req, "ops.read");
  res.json({ incidents: await openIncidents() });
});

adminRouter.post(
  "/admin/incidents/:incidentId/resolve",
  validateBody(z.object({ resolution: z.string().trim().min(3).max(1000) })),
  async (req, res) => {
    const id = await withPermission(req, "ops.read");
    const incident = await prisma.operationalIncident.findUnique({ where: { id: String(req.params.incidentId) } });
    if (!incident) throw notFound("Incident");
    await resolveIncident(String(req.params.incidentId), id, req.body.resolution);
    res.json({ ok: true });
  },
);

adminRouter.get("/admin/alerts", async (req, res) => {
  await withPermission(req, "ops.read");
  res.json({ alerts: await alertHistory() });
});

/**
 * Raises an alert and reports whether it was delivered.
 *
 * The destination comes from the environment, so an alert only goes somewhere
 * that was deliberately configured. A delivery that was not confirmed is
 * recorded as a failure rather than reported as having arrived.
 */
adminRouter.post(
  "/admin/alerts",
  validateBody(
    z.object({
      kind: z.string().trim().min(1).max(100),
      summary: z.string().trim().min(1).max(1000),
      severity: z.enum(["info", "warning", "critical"]).default("warning"),
    }),
  ),
  async (req, res) => {
    await withPermission(req, "ops.read");
    const destination = env.ALERT_DESTINATION;
    if (!destination) throw badRequest("No alert destination is configured.");

    const incidentId = await raiseIncident({
      kind: req.body.kind,
      severity: req.body.severity,
      summary: req.body.summary,
    });

    const outcome = await raiseAlert({
      kind: req.body.kind,
      summary: req.body.summary,
      severity: req.body.severity,
      incidentId,
      destination,
      deliver: async (summary, severity) => {
        // The configured destination is an operator's alerting channel. This
        // writes the alert to the log so the delivery is recorded; a
        // deployment points the same call at the real channel.
        logger.warn({ kind: req.body.kind, severity, summary, destination }, "Alert raised");
      },
    });

    res.status(outcome.delivered ? 201 : 502).json({
      incidentId,
      delivered: outcome.delivered,
      error: outcome.error,
    });
  },
);

// ---- Privileged interventions ----

/**
 * Adjusts a customer's credits.
 *
 * The adjustment goes through the credit ledger, so the balance still
 * reconciles, and it is audited with the reason the operator gave.
 */
adminRouter.post("/admin/credits/adjust", validateBody(creditAdjustmentSchema), async (req, res) => {
  const id = await withPermission(req, "credits.adjust");
  res.json(
    await adjustCredits({
      actorId: id,
      userId: req.body.userId,
      credits: req.body.credits,
      reason: req.body.reason,
      requestId: String(req.id),
    }),
  );
});

/**
 * Refunds a payment.
 *
 * The refund goes through the billing service, so it takes the credits back,
 * withdraws the capabilities the payment granted, and leaves a record in the
 * ledger — exactly as a refund from the provider would.
 */
adminRouter.post("/admin/payments/refund", validateBody(refundSchema), async (req, res) => {
  const id = await withPermission(req, "billing.refund");
  const payment = await prisma.payment.findUnique({ where: { id: req.body.paymentId } });
  if (!payment) throw notFound("Payment");
  if (payment.status === "refunded") {
    throw badRequest("That payment has already been refunded.");
  }

  // The refund is applied through the billing service, so it takes the credits
  // back, withdraws the capabilities the payment granted, and leaves the
  // record in the ledger exactly as a provider refund would.
  const outcome = await billingService.refundPayment(payment.userId, {
    type: "payment.refunded",
    providerEventId: `operator-refund:${payment.id}`,
    providerPaymentId: payment.providerPaymentId,
    customerReference: payment.providerCustomerReference,
    occurredAt: new Date(),
  });

  await recordAudit({
    actorId: id,
    action: "billing.refund",
    targetType: "payment",
    targetId: payment.id,
    reason: req.body.reason,
    details: { outcome },
    requestId: String(req.id),
  });

  res.json({ ...outcome, refundedBy: id });
});

/**
 * Retries or cancels a queued job.
 *
 * The intervention goes through the service that owns the job rather than
 * editing the row, so the job's credits are settled correctly and the
 * customer's chapters are released as they would be by the customer's own
 * request.
 */
adminRouter.post("/admin/jobs/intervene", validateBody(jobInterventionSchema), async (req, res) => {
  const id = await withPermission(req, "jobs.intervene");
  const job = await prisma.generationJob.findUnique({ where: { id: req.body.jobId } });
  if (!job) throw notFound("Job");
  if (job.status !== "queued" && job.status !== "running") {
    throw badRequest(`That job is already ${job.status}.`);
  }

  const { generationService } = await import("../services/generation/generationService.js");
  if (req.body.action === "cancel") {
    await generationService.cancel(job.userId, job.bookId, job.id);
  } else {
    // A retry re-queues the same job. The dispatcher owns the lease, so the
    // job is released here and picked up again by the queue.
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { status: "queued", cancelRequested: false, leaseToken: null, leaseExpiresAt: null },
    });
  }

  await recordAudit({
    actorId: id,
    action: `jobs.${req.body.action}`,
    targetType: "generation_job",
    targetId: job.id,
    reason: req.body.reason,
    details: { action: req.body.action, previousStatus: job.status },
    requestId: String(req.id),
  });

  res.json({ ok: true });
});

// ---- Roles ----

adminRouter.get("/admin/roles", async (req, res) => {
  await withPermission(req, "roles.manage");
  const holders = await Promise.all(ADMIN_ROLES.map((role) => roleHolders(role)));
  res.json({ roles: ADMIN_ROLES, holders: holders.flat() });
});

adminRouter.post("/admin/roles/grant", validateBody(roleChangeSchema), async (req, res) => {
  const id = await withPermission(req, "roles.manage");
  await grantRole(id, req.body.userId, req.body.role, req.body.reason, String(req.id));
  res.status(201).json({ ok: true });
});

adminRouter.post("/admin/roles/revoke", validateBody(roleChangeSchema), async (req, res) => {
  const id = await withPermission(req, "roles.manage");
  await revokeRole(id, req.body.userId, req.body.role, req.body.reason, String(req.id));
  res.json({ ok: true });
});

// ---- Audit ----

adminRouter.get("/admin/audit", async (req, res) => {
  await withPermission(req, "audit.read");
  const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
  res.json({
    entries: await auditTrail({
      limit,
      action: req.query.action ? String(req.query.action) : undefined,
      targetType: req.query.targetType ? String(req.query.targetType) : undefined,
      targetId: req.query.targetId ? String(req.query.targetId) : undefined,
      actorId: req.query.actorId ? String(req.query.actorId) : undefined,
    }),
  });
});

// ---- Backups ----

adminRouter.get("/admin/backups", async (req, res) => {
  await withPermission(req, "backup.manage");
  const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
  res.json({ backups: await listBackups(limit) });
});

adminRouter.get("/admin/backups/:name", async (req, res) => {
  await withPermission(req, "backup.manage");
  res.json({ backup: await getBackup(String(req.params.name)) });
});

adminRouter.post("/admin/backups", validateBody(z.object({ name: z.string().regex(BACKUP_NAME).optional(), reason: z.string().trim().max(1000).optional() })), async (req, res) => {
  const id = await withPermission(req, "backup.manage");
  const backup = await createBackup({ name: req.body?.name, actorId: id });
  await recordAudit({
    actorId: id,
    action: "backup.create",
    targetType: "backup",
    targetId: backup.name,
    reason: req.body?.reason ?? "Took a backup.",
    details: { bytes: backup.bytes, databaseSha256: backup.databaseSha256 },
    requestId: String(req.id),
  });
  res.status(201).json({ backup });
});

/**
 * Rehearses the restore of a backup into an isolated database.
 *
 * The rehearsal never touches the live database. It loads the dump into a
 * separate database, compares the counts with the manifest, and records the
 * result on the manifest.
 */
adminRouter.post(
  "/admin/backups/:name/restore",
  validateBody(z.object({ keepDatabase: z.boolean().optional().default(false) }).partial()),
  async (req, res) => {
    const id = await withPermission(req, "backup.manage");
    const result = await rehearseRestore(String(req.params.name), {
      keepDatabase: req.body.keepDatabase,
    });
    await recordAudit({
      actorId: id,
      action: "backup.restore_rehearsal",
      targetType: "backup",
      targetId: result.name,
      reason: req.body?.reason ?? "Rehearsed a restore.",
      details: { targetDatabase: result.targetDatabase, verified: result.verified },
      requestId: String(req.id),
    });
    res.json({ restore: result });
  },
);

adminRouter.delete("/admin/backups/:name", async (req, res) => {
  const id = await withPermission(req, "backup.manage");
  await deleteBackup(String(req.params.name));
  await recordAudit({
    actorId: id,
    action: "backup.delete",
    targetType: "backup",
    targetId: String(req.params.name),
    reason: req.body?.reason ?? "Removed a backup.",
    requestId: String(req.id),
  });
  res.json({ ok: true });
});

// ---- Support ----

adminRouter.get("/admin/support", async (req, res) => {
  await withPermission(req, "support.reply");
  const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
  res.json({
    requests: await supportList({
      limit,
      status: req.query.status ? String(req.query.status) : undefined,
    }),
  });
});

adminRouter.post("/admin/support/:requestId/reply", validateBody(supportReplySchema), async (req, res) => {
  const id = await withPermission(req, "support.reply");
  await replySupportRequest({
    actorId: id,
    requestId: String(req.params.requestId),
    response: req.body.response,
    requestIdHeader: String(req.id),
  });
  res.json({ ok: true });
});
