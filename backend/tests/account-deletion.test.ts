import { afterAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { prisma } from "../src/database/prisma.js";
import { closeQueues } from "../src/queues/index.js";
import { storage } from "../src/services/storage/storage.js";
import { creditService } from "../src/services/credits/creditService.js";
import { createUser, getApp, ORIGIN } from "./helpers.js";

afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
});

/**
 * Account deletion: the person's content, files and credentials go; the
 * credit ledger and payment history stay, attached to an anonymous tombstone.
 *
 * Before the fix, deleting a user either failed (assets and their book pins
 * are RESTRICT) or cascaded away the immutable ledger and the payments.
 */

const storageDir = process.env.STORAGE_DIR;
const onDisk = (key: string) => (storageDir ? existsSync(path.join(storageDir, key)) : true);

async function seedAccount(prefix: string) {
  const account = await createUser(prefix);
  const userId = account.user.id;
  await creditService.grant(userId, 50, `deletion-test:${userId}`, "Test grant");
  const project = await prisma.project.create({ data: { userId, name: "Shelf" } });
  const book = await prisma.book.create({ data: { userId, projectId: project.id, title: "To Be Deleted", status: "written" } });
  const chapter = await prisma.chapter.create({ data: { bookId: book.id, position: 0, title: "One", status: "done", wordCount: 3 } });

  // An uploaded image pinned by the book (both relations are RESTRICT).
  const assetKey = `assets/${userId}/deletion-test.webp`;
  await storage.put(assetKey, Buffer.from("webp-bytes"), "image/webp");
  const asset = await prisma.asset.create({ data: { userId, storageKey: assetKey, status: "ready", sha256: "0".repeat(64), width: 1, height: 1, bytes: 10 } });
  await prisma.assetReference.create({ data: { assetId: asset.id, bookId: book.id } });

  // A finished export with its stored file, and a finished job that pins the asset.
  const exportKey = `exports/${userId}/${book.id}/deletion-test.pdf`;
  await storage.put(exportKey, Buffer.from("%PDF-1.7"), "application/pdf");
  await prisma.export.create({ data: { userId, bookId: book.id, format: "pdf", status: "ready", storageKey: exportKey } });
  const job = await prisma.generationJob.create({ data: { userId, bookId: book.id, type: "image", status: "completed", assetId: asset.id } });
  await prisma.generationSection.create({ data: { jobId: job.id, chapterId: chapter.id, position: 0, kind: "section", text: "x", model: "mock" } });
  await prisma.qualityReport.create({ data: { bookId: book.id, userId, kind: "rules", status: "completed", rulesVersion: 1, fingerprint: "f", inputs: {} } });

  const payment = await prisma.payment.create({
    data: {
      userId, amountMinor: 1200, currency: "USD", credits: 0, status: "succeeded",
      providerPaymentId: `deletion-pay-${userId}`, providerCheckoutId: `deletion-checkout-${userId}`,
    },
  });
  return { ...account, userId, book, asset, assetKey, exportKey, payment };
}

describe("account deletion", () => {
  it("refuses without the account's email as confirmation", async () => {
    const { agent, userId } = await seedAccount("delete-confirm");
    const res = await agent.delete("/api/v1/users/me").set("Origin", ORIGIN).send({ confirmEmail: "someone-else@test.dev" });
    expect(res.status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletedAt).toBeNull();
  });

  it("removes content, files and credentials but keeps the ledger and payments", async () => {
    const seeded = await seedAccount("delete-me");
    const { agent, userId, email } = seeded;
    const ledgerBefore = await prisma.creditTransaction.count({ where: { userId } });
    expect(ledgerBefore).toBeGreaterThan(0);

    const res = await agent.delete("/api/v1/users/me").set("Origin", ORIGIN).send({ confirmEmail: email.toUpperCase() });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    // The tombstone: same id, no personal data.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.deletedAt).toBeTruthy();
    expect(user.email).not.toBe(email);
    expect(user.email).toMatch(/@deleted\.invalid$/);
    expect(user.name).toBe("Deleted account");
    expect(await prisma.account.count({ where: { userId } })).toBe(0);
    expect(await prisma.session.count({ where: { userId } })).toBe(0);

    // Financial history survives.
    expect(await prisma.creditTransaction.count({ where: { userId } })).toBe(ledgerBefore);
    expect(await prisma.payment.findUnique({ where: { id: seeded.payment.id } })).toBeTruthy();

    // Content is gone, files are removed, the upload is released.
    expect(await prisma.book.count({ where: { userId } })).toBe(0);
    expect(await prisma.project.count({ where: { userId } })).toBe(0);
    expect(await prisma.export.count({ where: { userId } })).toBe(0);
    expect(await prisma.generationJob.count({ where: { userId } })).toBe(0);
    expect(await prisma.qualityReport.count({ where: { userId } })).toBe(0);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: seeded.asset.id } })).status).toBe("deleted");
    expect(onDisk(seeded.assetKey)).toBe(false);
    expect(onDisk(seeded.exportKey)).toBe(false);

    // The session no longer works and the old credentials do not sign in.
    expect((await agent.get("/api/v1/users/me")).status).toBe(401);
    const signIn = await request(getApp()).post("/api/v1/auth/sign-in/email").set("Origin", ORIGIN).send({ email, password: "password123" });
    expect(signIn.status).not.toBe(200);

    // The action is on the audit trail.
    expect(await prisma.adminAuditEntry.findFirst({ where: { action: "account.delete", targetId: userId } })).toBeTruthy();
  });

  it("waits for running generation instead of deleting under it", async () => {
    const { agent, userId, email, book } = await seedAccount("delete-busy");
    await prisma.generationJob.create({ data: { userId, bookId: book.id, type: "chapters", status: "running" } });
    const res = await agent.delete("/api/v1/users/me").set("Origin", ORIGIN).send({ confirmEmail: email });
    expect(res.status).toBe(409);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletedAt).toBeNull();
    expect(await prisma.book.count({ where: { userId } })).toBe(1);
  });

  it("refuses while a subscription would still renew", async () => {
    const { agent, userId, email } = await seedAccount("delete-subscribed");
    const plan = await prisma.plan.upsert({ where: { id: "deletion-test-plan" }, create: { id: "deletion-test-plan", name: "Test", priceMinor: 100, recurring: true }, update: {} });
    await prisma.subscription.create({ data: { userId, planId: plan.id, providerSubscriptionId: `deletion-sub-${userId}`, status: "active" } });
    const res = await agent.delete("/api/v1/users/me").set("Origin", ORIGIN).send({ confirmEmail: email });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/subscription/i);
  });
});
