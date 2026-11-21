import { afterAll, describe, expect, it, vi } from "vitest";
import { Queue, Worker } from "bullmq";
import { randomUUID } from "node:crypto";
import { compatibilityFingerprint, workerQueuePrefix } from "../src/config/runtime.js";
import { env } from "../src/config/env.js";
import { getRuntimeRedis, redisConnection } from "../src/config/redis.js";
import { Prisma } from "../src/generated/prisma/client.js";
import { prisma } from "../src/database/prisma.js";
import { closeQueues, dispatchPending, getQueues } from "../src/queues/index.js";
import { startWorkerHeartbeat, runtimeReadiness } from "../src/services/runtime/readiness.js";
import { canonicalJson } from "../src/services/operations/operationService.js";
import { outlineService } from "../src/services/outline/outlineService.js";
import { closeBrowser } from "../src/services/exports/pdfRenderer.js";
import { exportService } from "../src/services/exports/exportService.js";
import { storage } from "../src/services/storage/storage.js";
import { brief, createUser, grantEntitlements, ORIGIN, PAID_ENTITLEMENTS } from "./helpers.js";

const id = () => randomUUID();
afterAll(async () => { await closeBrowser(); await closeQueues(); await prisma.$disconnect(); });

describe("durable operation identity", () => {
  it("replays creation once, rejects changed input and scopes lookup by owner", async () => {
    const { agent, user } = await createUser("operation");
    const key = id();
    const first = await agent.post("/api/v1/books").set("Origin", ORIGIN).set("Idempotency-Key", key).send(brief()).expect(201);
    const replay = await agent.post("/api/v1/books").set("Origin", ORIGIN).set("Idempotency-Key", key).send(brief()).expect(201);
    expect(replay.body.book.id).toBe(first.body.book.id);
    expect(replay.body.operationId).toBe(first.body.operationId);
    expect(replay.body.replayed).toBe(true);
    expect(await prisma.book.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.generationJob.count({ where: { bookId: first.body.book.id } })).toBe(1);
    await agent.post("/api/v1/books").set("Origin", ORIGIN).set("Idempotency-Key", key).send(brief({ topic: "Something entirely different" })).expect(409);
    const status = await agent.get(`/api/v1/operations/${first.body.operationId}`).expect(200);
    expect(status.body.operation.state).toBe("queued");
    await outlineService.process(first.body.job.id);
    expect((await agent.get(`/api/v1/operations/${first.body.operationId}`).expect(200)).body.operation.state).toBe("completed");
    const intruder = await createUser("operation-other");
    await intruder.agent.get(`/api/v1/operations/${first.body.operationId}`).expect(404);
    await intruder.agent.get(`/api/v1/books/${first.body.book.id}/operations`).expect(404);
    await agent.get(`/api/v1/books/${first.body.book.id}/operations?limit=101`).expect(400);
    await agent.delete(`/api/v1/books/${first.body.book.id}`).set("Origin", ORIGIN).expect(204);
    await agent.get(`/api/v1/operations/${first.body.operationId}`).expect(404);
    await agent.post("/api/v1/books").set("Origin", ORIGIN).set("Idempotency-Key", key).send(brief()).expect(404);
  });

  it("serializes concurrent submissions and persists a single dispatch", async () => {
    const { agent, user } = await createUser("operation-race");
    const key = id();
    const results = await Promise.all(Array.from({ length: 3 }, () => agent.post("/api/v1/books").set("Origin", ORIGIN).set("Idempotency-Key", key).send(brief())));
    expect(results.every((r) => [201, 409].includes(r.status))).toBe(true);
    expect(results.some((r) => r.status === 201)).toBe(true);
    const books = await prisma.book.findMany({ where: { userId: user.id } });
    expect(books).toHaveLength(1);
    const jobs = await prisma.generationJob.findMany({ where: { bookId: books[0].id } });
    expect(jobs).toHaveLength(1);
    const dispatch = await prisma.queueDispatch.findFirstOrThrow({ where: { jobId: jobs[0].id } });
    expect(dispatch.dispatchedAt).not.toBeNull();
    // Replay a persisted outbox dispatch after an uncertain acknowledgment.
    await prisma.queueDispatch.update({ where: { id: dispatch.id }, data: { dispatchedAt: null } });
    await dispatchPending(dispatch.id);
    expect((await prisma.queueDispatch.findUniqueOrThrow({ where: { id: dispatch.id } })).dispatchedAt).not.toBeNull();
  });

  it("replays validation failures with the current support request id", async () => {
    const { agent, user } = await createUser("operation-failure");
    // Exporting is a paid capability, so the test says it is assuming a paid plan.
    await grantEntitlements(user.id, PAID_ENTITLEMENTS);
    const first = await agent.post("/api/v1/books").set("Origin", ORIGIN).send(brief()).expect(201);
    const url = `/api/v1/books/${first.body.book.id}/exports`;
    const key = id();
    await agent.post(url).set("Origin", ORIGIN).set("Idempotency-Key", key).send({ format: "pdf" }).expect(409);
    const replay = await agent.post(url).set("Origin", ORIGIN).set("Idempotency-Key", key).set("X-Request-Id", "support_replay").send({ format: "pdf" }).expect(409);
    expect(replay.body.error.requestId).toBe("support_replay");
    expect(replay.body.replayed).toBe(true);
  });

  it("keeps uncertain submissions visible without executing them again", async () => {
    const { agent, user } = await createUser("uncertain");
    const key = id();
    const result = await agent.post("/api/v1/books").set("Origin", ORIGIN).set("Idempotency-Key", key).send(brief()).expect(201);
    await prisma.operation.update({ where: { id: result.body.operationId }, data: { state: "needs_review", responseBody: Prisma.DbNull, responseStatus: null } });
    const replay = await agent.post("/api/v1/books").set("Origin", ORIGIN).set("Idempotency-Key", key).send(brief()).expect(409);
    // The replay is told the attempt needs review rather than to keep waiting,
    // and it is still not executed a second time.
    expect(replay.body.error.code).toBe("OPERATION_NEEDS_REVIEW");
    expect(replay.body.error.details.operationId).toBe(result.body.operationId);
    expect(await prisma.book.count({ where: { userId: user.id } })).toBe(1);
    expect((await agent.get(`/api/v1/operations/${result.body.operationId}`).expect(200)).body.operation.state).toBe("needs_review");
  });

  it("retains dispatch through a broker failure and retries the original job", async () => {
    const { agent } = await createUser("dispatch-recovery");
    const enqueue = vi.spyOn(getQueues().outline, "add").mockRejectedValueOnce(new Error("Broker unavailable"));
    let created;
    try { created = await agent.post("/api/v1/books").set("Origin", ORIGIN).send(brief()).expect(201); }
    finally { enqueue.mockRestore(); }
    const dispatch = await prisma.queueDispatch.findFirstOrThrow({ where: { jobId: created.body.job.id } });
    expect(dispatch.dispatchedAt).toBeNull();
    expect(dispatch.attempts).toBe(1);
    await prisma.queueDispatch.update({ where: { id: dispatch.id }, data: { nextAttemptAt: new Date(0) } });
    await dispatchPending(dispatch.id);
    expect((await prisma.queueDispatch.findUniqueOrThrow({ where: { id: dispatch.id } })).dispatchedAt).not.toBeNull();
    expect(await prisma.generationJob.count({ where: { id: created.body.job.id } })).toBe(1);
  });

  it("canonicalizes object key order but preserves array order", () => {
    expect(canonicalJson({ a: 1, b: { d: 2, c: 3 } })).toBe(canonicalJson({ b: { c: 3, d: 2 }, a: 1 }));
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

describe("environment and worker readiness", () => {
  it("isolates actual workers on the same Redis connection by namespace", async () => {
    const prefix = `test-isolation-${id()}`;
    const queue = new Queue("isolation", { prefix: `${prefix}-local`, connection: redisConnection() });
    let wrongHandled = false;
    const wrong = new Worker("isolation", async () => { wrongHandled = true; }, { prefix: `${prefix}-staging`, connection: redisConnection() });
    let handled = false;
    const correct = new Worker("isolation", async () => { handled = true; }, { prefix: `${prefix}-local`, connection: redisConnection() });
    try {
      await Promise.all([wrong.waitUntilReady(), correct.waitUntilReady()]);
      await queue.add("run", {}, { jobId: "isolation-task" });
      const until = Date.now() + 4000;
      while (!handled && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 25));
      expect(handled).toBe(true);
      expect(wrongHandled).toBe(false);
    } finally {
      await Promise.all([wrong.close(), correct.close()]);
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });

  it("requires fresh heartbeat capabilities and a readable storage probe", async () => {
    const stop = await startWorkerHeartbeat(["outline", "chapters", "exports", "images", "quality"]);
    try {
      expect(await runtimeReadiness()).toEqual({ database: true, redis: true, workers: true, storage: true });
      const client = await getRuntimeRedis();
      const registry = `${workerQueuePrefix}:runtime`;
      const ids = await client.zrangebyscore(registry, "-inf", "+inf");
      expect(ids.length).toBeGreaterThan(0);
      for (const workerId of ids) {
        const value = await client.get(`${registry}:${workerId}`);
        if (value) await storage.remove(JSON.parse(value).probeKey);
      }
      expect((await runtimeReadiness()).storage).toBe(false);
      await client.zremrangebyscore(registry, "-inf", "+inf");
      expect((await runtimeReadiness()).workers).toBe(false);
    } finally { await stop(); }
  });

  it("changes compatibility for database, storage and model configuration without exposing secrets", () => {
    const fingerprint = compatibilityFingerprint();
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(compatibilityFingerprint({ ...env, DATABASE_URL: `${env.DATABASE_URL}_other` })).not.toBe(fingerprint);
    expect(compatibilityFingerprint({ ...env, STORAGE_DIR: "/tmp/separate-storage" })).not.toBe(fingerprint);
    expect(compatibilityFingerprint({ ...env, AI_MOCK: !env.AI_MOCK })).not.toBe(fingerprint);
  });

  it("validates and downloads a file through the API that reads the worker storage", async () => {
    const { agent, user } = await createUser("artifact");
    // Exporting is a paid capability, so the test says it is assuming a paid plan.
    await grantEntitlements(user.id, PAID_ENTITLEMENTS);
    const created = await agent.post("/api/v1/books").set("Origin", ORIGIN).send(brief()).expect(201);
    const bookId = created.body.book.id;
    await outlineService.process(created.body.job.id);
    await agent.post(`/api/v1/books/${bookId}/outline/approve`).set("Origin", ORIGIN).send({ version: 1 }).expect(200);
    const chapter = await prisma.chapter.findFirstOrThrow({ where: { bookId } });
    await agent.patch(`/api/v1/chapters/${chapter.id}`).set("Origin", ORIGIN).send({ version: chapter.version, contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Artifact storage check" }] }] } }).expect(200);
    const requested = await agent.post(`/api/v1/books/${bookId}/exports`).set("Origin", ORIGIN).send({ format: "pdf" }).expect(202);
    await exportService.process(requested.body.export.id);
    const file = await agent.get(`/api/v1/exports/${requested.body.export.id}/download`).expect(200);
    expect(file.headers["content-type"]).toContain("application/pdf");
    expect(file.body.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
