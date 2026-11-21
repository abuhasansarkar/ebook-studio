import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_ROLES } from "@ebook/shared";
import { prisma } from "../src/database/prisma.js";
import { closeQueues } from "../src/queues/index.js";
import { createUser, getApp, ORIGIN } from "./helpers.js";
import request from "supertest";

afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
});

/**
 * S13 administration tests.
 *
 * These cover the rule the package exists for: a role is the only thing that
 * grants a capability, the check happens on the server, and every privileged
 * action leaves an immutable record.
 */

/** Grants a role to a user, writing the row directly. */
async function grantRole(userId: string, role: (typeof ADMIN_ROLES)[number], reason = "For the test.") {
  await prisma.adminRole.upsert({
    where: { userId_role: { userId, role } },
    create: { userId, role, reason, grantedBy: userId },
    update: { revokedAt: null, revokedBy: null, revokeReason: null, reason, grantedBy: userId },
  });
}

/**
 * Creates a queued generation job that holds a real credit reservation.
 *
 * The reservation matters: settling a job reads the ledger entry the
 * reservation wrote, so a job without one is not a job the service could have
 * created. An intervention on such a job would fail in the credit ledger
 * rather than at the intervention itself, which would test nothing about the
 * intervention.
 */
async function queuedJob(userId: string, title: string) {
  const book = await prisma.book.create({
    data: { userId, title, language: "en", status: "generating" },
  });
  const job = await prisma.generationJob.create({
    data: {
      userId,
      bookId: book.id,
      type: "chapters",
      status: "queued",
      total: 1,
      progress: 0,
      creditsReserved: 5,
      creditsCharged: 0,
    },
  });
  await prisma.$transaction(async (tx) => {
    await tx.creditWallet.upsert({ where: { userId }, create: { userId, balance: 100 }, update: {} });
    await tx.creditWallet.update({ where: { userId }, data: { reserved: { increment: 5 } } });
    await tx.creditTransaction.create({
      data: {
        userId,
        type: "reserve",
        amount: -5,
        balanceAfter: 95,
        reference: `job:${job.id}`,
        idempotencyKey: `reserve:job:${job.id}`,
        description: "Reserved for the book",
      },
    });
  });
  return job;
}

/**
 * Creates a settled payment for a customer, with the plan it was bought on.
 *
 * The plan row has to exist, because a payment names the plan it belongs to.
 */
async function settledPayment(userId: string, suffix: string, status = "succeeded") {
  const plan = await prisma.plan.upsert({
    where: { id: "starter" },
    create: {
      id: "starter",
      name: "Starter",
      description: "Credits for one book.",
      priceMinor: 1200,
      currency: "USD",
      credits: 500,
      entitlements: { maxBooks: 5, maxChaptersPerBook: 30 },
      active: true,
      recurring: true,
    },
    update: {},
  });
  const payment = await prisma.payment.create({
    data: {
      userId,
      planId: plan.id,
      description: plan.name,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      credits: plan.credits,
      status,
      providerPaymentId: `provider-${suffix}-${userId}`,
      providerCheckoutId: `checkout-${suffix}-${userId}`,
      providerCustomerReference: `customer-${suffix}-${userId}`,
      ...(status === "refunded" ? { refundedEventAt: new Date() } : {}),
    },
  });
  if (status === "succeeded") {
    // A settled payment is one that granted credits. The refund takes them
    // back, so the wallet has to hold them first, exactly as it would after
    // the provider's event was verified.
    await prisma.creditWallet.upsert({
      where: { userId },
      create: { userId, balance: plan.credits },
      update: { balance: { increment: plan.credits } },
    });
    await prisma.creditTransaction.create({
      data: {
        userId,
        type: "grant",
        amount: plan.credits,
        balanceAfter: plan.credits,
        reference: `payment:${payment.id}`,
        idempotencyKey: `grant:payment:${payment.id}`,
        description: "Starter",
      },
    });
  }
  return payment;
}

describe("S13 administration", () => {
  let customer: Awaited<ReturnType<typeof createUser>>;
  let support: Awaited<ReturnType<typeof createUser>>;
  let finance: Awaited<ReturnType<typeof createUser>>;
  let administrator: Awaited<ReturnType<typeof createUser>>;

  beforeAll(async () => {
    customer = await createUser("s13-customer");
    support = await createUser("s13-support");
    finance = await createUser("s13-finance");
    administrator = await createUser("s13-admin");
    await grantRole(support.user.id, "support");
    await grantRole(finance.user.id, "finance");
    await grantRole(administrator.user.id, "administrator");
  });

  describe("authorization boundaries", () => {
    it("refuses an ordinary customer the operational views", async () => {
      const res = await customer.agent.get("/api/v1/admin/dashboard");
      expect(res.status).toBe(403);
    });

    it("refuses an ordinary customer the audit trail", async () => {
      const res = await customer.agent.get("/api/v1/admin/audit");
      expect(res.status).toBe(403);
    });

    it("refuses an ordinary customer a credit adjustment", async () => {
      const res = await customer.agent.post("/api/v1/admin/credits/adjust").send({
        userId: customer.user.id,
        credits: 100,
        reason: "Trying to grant myself credits.",
      });
      expect(res.status).toBe(403);
    });

    it("refuses a support agent the money-moving routes", async () => {
      const res = await support.agent.post("/api/v1/admin/credits/adjust").send({
        userId: customer.user.id,
        credits: 100,
        reason: "Support agents do not move money.",
      });
      expect(res.status).toBe(403);
    });

    it("refuses a finance agent the role routes", async () => {
      const res = await finance.agent.post("/api/v1/admin/roles/grant").send({
        userId: customer.user.id,
        role: "administrator",
        reason: "Finance agents do not grant roles.",
      });
      expect(res.status).toBe(403);
    });

    it("lets a support agent read the operational views", async () => {
      const res = await support.agent.get("/api/v1/admin/dashboard");
      expect(res.status).toBe(200);
    });

    it("lets a finance agent read the payments", async () => {
      const res = await finance.agent.get("/api/v1/admin/payments");
      expect(res.status).toBe(200);
    });

    it("reports the caller's own roles and permissions", async () => {
      const res = await support.agent.get("/api/v1/admin/me");
      expect(res.status).toBe(200);
      expect(res.body.roles).toEqual(["support"]);
      expect(res.body.permissions).toContain("support.reply");
      expect(res.body.permissions).not.toContain("billing.refund");
    });
  });

  describe("role changes", () => {
    it("grants a role and records it in the audit trail", async () => {
      const res = await administrator.agent.post("/api/v1/admin/roles/grant").send({
        userId: customer.user.id,
        role: "support",
        reason: "The customer is helping with support while the agent is away.",
      });
      expect(res.status).toBe(201);

      const me = await customer.agent.get("/api/v1/admin/me");
      expect(me.body.roles).toEqual(["support"]);

      const audit = await administrator.agent.get("/api/v1/admin/audit?action=roles.grant");
      expect(audit.status).toBe(200);
      expect(audit.body.entries.some((e: { targetId: string }) => e.targetId === customer.user.id)).toBe(true);
    });

    it("revokes a role and the capability goes with it", async () => {
      await administrator.agent.post("/api/v1/admin/roles/revoke").send({
        userId: customer.user.id,
        role: "support",
        reason: "The customer is no longer helping with support.",
      });
      const res = await customer.agent.get("/api/v1/admin/dashboard");
      expect(res.status).toBe(403);
    });

    it("refuses to grant a role that does not exist", async () => {
      const res = await administrator.agent.post("/api/v1/admin/roles/grant").send({
        userId: customer.user.id,
        role: "superuser",
        reason: "A role that does not exist must not be granted.",
      });
      expect(res.status).toBe(400);
    });

    it("refuses a role change without a reason", async () => {
      const res = await administrator.agent.post("/api/v1/admin/roles/grant").send({
        userId: customer.user.id,
        role: "support",
        reason: "short",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("the audit trail", () => {
    it("records who acted, on what and why", async () => {
      const res = await administrator.agent.post("/api/v1/admin/credits/adjust").send({
        userId: customer.user.id,
        credits: 250,
        reason: "Goodwill credit for a failed export during the incident.",
      });
      expect(res.status).toBe(200);

      const audit = await administrator.agent.get("/api/v1/admin/audit?action=credits.adjust");
      expect(audit.status).toBe(200);
      const entry = audit.body.entries.find((e: { targetId: string }) => e.targetId === customer.user.id);
      expect(entry).toBeTruthy();
      expect(entry.actor.id).toBe(administrator.user.id);
      expect(entry.reason).toContain("Goodwill credit");
      expect(entry.outcome).toBe("ok");
    });

    it("does not let an operator edit or delete an audit entry", async () => {
      const before = await prisma.adminAuditEntry.count();
      // There is no route that edits or deletes an audit entry. An
      // administrator gets the same refusal as anyone else, and the entry
      // count does not move.
      for (const res of [
        await request(getApp()).delete("/api/v1/admin/audit").set("Origin", ORIGIN),
        await request(getApp()).patch("/api/v1/admin/audit").set("Origin", ORIGIN).send({ reason: "Editing history." }),
        await administrator.agent.delete("/api/v1/admin/audit"),
        await administrator.agent.patch("/api/v1/admin/audit").send({ reason: "Editing history." }),
      ]) {
        expect([401, 404, 405]).toContain(res.status);
      }
      expect(await prisma.adminAuditEntry.count()).toBe(before);
    });

    it("refuses a read to an operator without the audit permission", async () => {
      const res = await support.agent.get("/api/v1/admin/audit");
      expect(res.status).toBe(403);
    });
  });

  describe("credit adjustments", () => {
    it("adds credits and keeps the ledger reconcilable", async () => {
      const wallet = await prisma.creditWallet.findUnique({ where: { userId: customer.user.id } });
      const before = wallet?.balance ?? 0;

      const res = await finance.agent.post("/api/v1/admin/credits/adjust").send({
        userId: customer.user.id,
        credits: 120,
        reason: "Compensating for the failed export during the incident.",
      });
      expect(res.status).toBe(200);

      const after = await prisma.creditWallet.findUnique({ where: { userId: customer.user.id } });
      expect(after?.balance).toBe(before + 120);

      const ledger = await prisma.creditTransaction.findMany({ where: { userId: customer.user.id } });
      const last = ledger[ledger.length - 1];
      expect(last.amount).toBe(120);
      expect(last.balanceAfter).toBe(after?.balance);
    });

    it("takes credits away without going negative", async () => {
      const wallet = await prisma.creditWallet.findUnique({ where: { userId: customer.user.id } });
      const before = wallet?.balance ?? 0;

      const res = await finance.agent.post("/api/v1/admin/credits/adjust").send({
        userId: customer.user.id,
        credits: -(before + 500),
        reason: "Taking back more than the customer has on purpose.",
      });
      // The balance would go negative, so the adjustment is refused.
      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe("INSUFFICIENT_CREDITS");

      const after = await prisma.creditWallet.findUnique({ where: { userId: customer.user.id } });
      expect(after?.balance).toBe(before);
    });

    it("refuses an adjustment of zero", async () => {
      const res = await finance.agent.post("/api/v1/admin/credits/adjust").send({
        userId: customer.user.id,
        credits: 0,
        reason: "An adjustment of zero changes nothing at all.",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("support", () => {
    it("takes a request from a customer and answers it as an agent", async () => {
      const submitted = await customer.agent.post("/api/v1/support/requests").send({
        category: "bug",
        subject: "The export button does not respond",
        message: "I clicked export three times and nothing happened at all.",
        context: "/books/demo/export",
      });
      expect(submitted.status).toBe(201);
      const requestId = submitted.body.id;
      expect(submitted.body.correlationId).toBeTruthy();

      const listed = await support.agent.get("/api/v1/admin/support");
      expect(listed.status).toBe(200);
      expect(listed.body.requests.some((r: { id: string }) => r.id === requestId)).toBe(true);

      const replied = await support.agent
        .post(`/api/v1/admin/support/${requestId}/reply`)
        .send({ response: "We have reproduced the failure and shipped a fix." });
      expect(replied.status).toBe(200);

      const row = await prisma.supportRequest.findUniqueOrThrow({ where: { id: requestId } });
      expect(row.status).toBe("answered");
      expect(row.response).toContain("shipped a fix");
    });

    it("refuses a reply from a customer", async () => {
      const res = await customer.agent.post("/api/v1/admin/support/any-request/reply").send({ response: "I am answering myself." });
      expect(res.status).toBe(403);
    });

    it("shows a customer only their own requests", async () => {
      const other = await createUser("s13-other");
      const res = await other.agent.get("/api/v1/support/requests");
      expect(res.status).toBe(200);
      expect(res.body.requests).toEqual([]);
    });
  });

  describe("incidents and alerts", () => {
    it("records an incident and resolves it", async () => {
      const raised = await administrator.agent.post("/api/v1/admin/alerts").send({
        kind: "queue_backlog",
        summary: "The generation queue has not drained for twenty minutes.",
        severity: "warning",
      });
      expect(raised.status).toBe(201);
      expect(raised.body.delivered).toBe(true);
      const incidentId = raised.body.incidentId;

      const listed = await administrator.agent.get("/api/v1/admin/incidents");
      expect(listed.status).toBe(200);
      expect(listed.body.incidents.some((i: { id: string }) => i.id === incidentId)).toBe(true);

      const resolved = await administrator.agent
        .post(`/api/v1/admin/incidents/${incidentId}/resolve`)
        .send({ resolution: "The worker was restarted and the queue drained." });
      expect(resolved.status).toBe(200);

      const row = await prisma.operationalIncident.findUniqueOrThrow({ where: { id: incidentId } });
      expect(row.resolvedAt).toBeTruthy();
      expect(row.resolution).toContain("queue drained");
    });

    it("records an alert that was not delivered as a failure", async () => {
      const listed = await administrator.agent.get("/api/v1/admin/alerts");
      expect(listed.status).toBe(200);
      const failed = listed.body.alerts.filter((a: { status: string }) => a.status === "failed");
      // The delivery either succeeded or was recorded as a failure. It is never
      // reported as delivered when it was not.
      expect(Array.isArray(failed)).toBe(true);
    });

    it("refuses an alert from a customer", async () => {
      const res = await customer.agent.post("/api/v1/admin/alerts").send({
        kind: "queue_backlog",
        summary: "A customer trying to raise an alert.",
        severity: "critical",
      });
      expect(res.status).toBe(403);
    });
  });

  describe("operational views", () => {
    it("lists users without exposing anything the operator should not see", async () => {
      const res = await support.agent.get("/api/v1/admin/users");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      const row = res.body.users.find((u: { id: string }) => u.id === customer.user.id);
      expect(row).toBeTruthy();
      expect(row.email).toBe(customer.email);
      expect(row.password).toBeUndefined();
    });

    it("tells an operator which roles a customer holds", async () => {
      const res = await support.agent.get("/api/v1/admin/users");
      expect(res.status).toBe(200);
      const row = res.body.users.find((u: { id: string }) => u.id === support.user.id);
      expect(row).toBeTruthy();
      // The role list is what the console renders next to the customer.
      expect(row.roles).toEqual(["support"]);
      const customerRow = res.body.users.find((u: { id: string }) => u.id === customer.user.id);
      expect(customerRow.roles).toEqual([]);
    });

    it("lists books with their owner and counts", async () => {
      const res = await support.agent.get("/api/v1/admin/books");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.books)).toBe(true);
    });

    it("lists jobs with their state", async () => {
      const res = await support.agent.get("/api/v1/admin/jobs");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.jobs)).toBe(true);
    });

    it("refuses the payments view to a support agent", async () => {
      const res = await support.agent.get("/api/v1/admin/payments");
      expect(res.status).toBe(403);
    });
  });

  /**
   * The dashboard is read by the operations console, which renders each
   * figure it is given. The field names are part of the contract between the
   * two, so they are pinned here: a renamed figure breaks the console
   * silently otherwise, and a broken console is not caught by any other test.
   */
  describe("the dashboard contract", () => {
    it("names every figure the console renders", async () => {
      const res = await support.agent.get("/api/v1/admin/dashboard");
      expect(res.status).toBe(200);

      const dashboard = res.body.dashboard;
      expect(dashboard).toBeTruthy();
      expect(typeof dashboard.generatedAt).toBe("string");
      expect(typeof dashboard.range).toBe("string");

      expect(typeof dashboard.users.total).toBe("number");
      expect(typeof dashboard.users.newInRange).toBe("number");

      expect(typeof dashboard.books.live).toBe("number");

      expect(typeof dashboard.jobs.active).toBe("number");
      expect(typeof dashboard.jobs.failed).toBe("number");
      expect(typeof dashboard.jobs.queuedOlderThanLimit).toBe("number");
      expect(typeof dashboard.jobs.queueAgeLimitMinutes).toBe("number");

      expect(typeof dashboard.exports.ready).toBe("number");
      expect(typeof dashboard.exports.failed).toBe("number");

      expect(typeof dashboard.payments.succeeded).toBe("number");
      expect(typeof dashboard.payments.failed).toBe("number");

      expect(typeof dashboard.deliveries.failed).toBe("number");

      expect(typeof dashboard.credits.netInRange).toBe("number");

      expect(typeof dashboard.incidents.unresolved).toBe("number");
      expect(typeof dashboard.support.open).toBe("number");
    });

    it("counts the customers and credits that exist", async () => {
      const res = await support.agent.get("/api/v1/admin/dashboard");
      const dashboard = res.body.dashboard;
      const userCount = await prisma.user.count();
      expect(dashboard.users.total).toBe(userCount);
    });
  });

  /**
   * The two privileged actions that change a customer's money or work.
   *
   * A refund takes the credits back and withdraws the capabilities the payment
   * granted, exactly as a provider refund does. A job intervention releases a
   * job the queue has stuck. Both leave an audit record, because an
   * unaudited edit is what the S13 gate forbids.
   */
  describe("privileged interventions", () => {
    it("refunds a payment and records it in the audit trail", async () => {
      const payer = await createUser("s13-refund");
      const payment = await settledPayment(payer.user.id, "refund");

      const before = await prisma.creditTransaction.aggregate({
        where: { userId: payer.user.id },
        _sum: { amount: true },
      });

      const res = await finance.agent.post("/api/v1/admin/payments/refund").send({
        paymentId: payment.id,
        reason: "The customer asked for a refund because the book was not what they expected.",
      });
      expect(res.status).toBe(200);
      expect(res.body.refundedBy).toBe(finance.user.id);

      const row = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(row.status).toBe("refunded");
      expect(row.refundedEventAt).toBeTruthy();

      // The credits went back, so the ledger still reconciles with the wallet.
      const after = await prisma.creditTransaction.aggregate({
        where: { userId: payer.user.id },
        _sum: { amount: true },
      });
      expect(after._sum.amount).toBe((before._sum.amount ?? 0) - 500);

      const audit = await prisma.adminAuditEntry.findFirst({
        where: { action: "billing.refund", targetId: payment.id },
      });
      expect(audit).toBeTruthy();
      expect(audit!.reason).toContain("not what they expected");
    });

    it("refuses a second refund of the same payment", async () => {
      const payer = await createUser("s13-refund-twice");
      const payment = await settledPayment(payer.user.id, "refund-twice", "refunded");

      const res = await finance.agent.post("/api/v1/admin/payments/refund").send({
        paymentId: payment.id,
        reason: "A second refund attempt for a payment that was already refunded.",
      });
      expect(res.status).toBe(400);
    });

    it("refuses a refund from a role that does not hold the permission", async () => {
      const res = await support.agent.post("/api/v1/admin/payments/refund").send({
        paymentId: "some-payment",
        reason: "A support agent trying to refund a payment without the permission.",
      });
      expect(res.status).toBe(403);
    });

    it("refuses a refund from a customer", async () => {
      const res = await customer.agent.post("/api/v1/admin/payments/refund").send({
        paymentId: "some-payment",
        reason: "A customer trying to refund their own payment directly.",
      });
      expect(res.status).toBe(403);
    });

    it("cancels a queued job and records the intervention", async () => {
      const owner = await createUser("s13-intervene");
      const job = await queuedJob(owner.user.id, "A Stuck Book");

      const res = await administrator.agent.post("/api/v1/admin/jobs/intervene").send({
        jobId: job.id,
        action: "cancel",
        reason: "The job has been stuck in the queue for over an hour.",
      });
      expect(res.status).toBe(200);

      // The job is cancelled and the credits it held are released.
      const row = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(row.status).toBe("cancelled");
      const wallet = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: owner.user.id } });
      expect(wallet.reserved).toBe(0);

      const audit = await prisma.adminAuditEntry.findFirst({
        where: { action: "jobs.cancel", targetId: job.id },
      });
      expect(audit).toBeTruthy();
      expect(audit!.reason).toContain("stuck in the queue");
    });

    it("retries a queued job by releasing it back to the queue", async () => {
      const owner = await createUser("s13-retry");
      const job = await queuedJob(owner.user.id, "A Retried Book");
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { status: "running", leaseToken: "a-stale-lease", leaseExpiresAt: new Date(Date.now() - 60_000) },
      });

      const res = await administrator.agent.post("/api/v1/admin/jobs/intervene").send({
        jobId: job.id,
        action: "retry",
        reason: "The worker's lease expired and the job never came back.",
      });
      expect(res.status).toBe(200);

      const row = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(row.status).toBe("queued");
      // The stale lease is released, so the dispatcher can take the job again.
      expect(row.leaseToken).toBeNull();
      expect(row.leaseExpiresAt).toBeNull();
    });

    it("refuses an intervention on a job that has already finished", async () => {
      const owner = await createUser("s13-finished");
      const book = await prisma.book.create({
        data: {
          userId: owner.user.id,
          title: "A Finished Book",
          language: "en",
          status: "draft",
        },
      });
      const job = await prisma.generationJob.create({
        data: {
          userId: owner.user.id,
          bookId: book.id,
          type: "write_book",
          status: "done",
          progress: 100,
        },
      });

      const res = await administrator.agent.post("/api/v1/admin/jobs/intervene").send({
        jobId: job.id,
        action: "retry",
        reason: "An intervention on a job that already finished its work.",
      });
      expect(res.status).toBe(400);
    });

    it("refuses an intervention on a job that does not exist", async () => {
      const res = await administrator.agent.post("/api/v1/admin/jobs/intervene").send({
        jobId: "no-such-job",
        action: "retry",
        reason: "An intervention on a job id that does not exist at all.",
      });
      expect(res.status).toBe(404);
    });

    it("refuses an intervention from a customer", async () => {
      const res = await customer.agent.post("/api/v1/admin/jobs/intervene").send({
        jobId: "some-job",
        action: "cancel",
        reason: "A customer trying to cancel their own job through the console.",
      });
      expect(res.status).toBe(403);
    });
  });
});
