import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { CREDIT_COSTS, FREE_SIGNUP_CREDITS, chapterCredits } from "@ebook/shared";
import { prisma } from "../src/database/prisma.js";
import { closeQueues } from "../src/queues/index.js";
import { outlineService } from "../src/services/outline/outlineService.js";
import { generationService } from "../src/services/generation/generationService.js";
import { creditService } from "../src/services/credits/creditService.js";
import { ORIGIN, brief, createUser, getApp } from "./helpers.js";

afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
});

/** Creates a book and runs the outline job inline (no worker needed). */
async function bookWithOutline(agent: Awaited<ReturnType<typeof createUser>>["agent"], overrides = {}) {
  const res = await agent.post("/api/v1/books").set("Origin", ORIGIN).send(brief(overrides));
  expect(res.status).toBe(201);
  expect(res.body.job).toBeTruthy();
  await outlineService.process(res.body.job.id);
  return res.body.book.id as string;
}

describe("auth & access control", () => {
  it("health check reports database and redis", async () => {
    const res = await request(getApp()).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.checks).toEqual({ database: true, redis: true });
  });

  it("rejects protected routes without a session", async () => {
    const res = await request(getApp()).get("/api/v1/books");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects unverified users", async () => {
    const { agent, user } = await createUser("unverified");
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: false } });
    const res = await agent.get("/api/v1/books");
    expect(res.status).toBe(403);
  });

  it("grants welcome credits once", async () => {
    const { agent, user } = await createUser("credits");
    const res = await agent.get("/api/v1/credits");
    expect(res.body.wallet.balance).toBe(FREE_SIGNUP_CREDITS);
    await creditService.grantSignupBonus(user.id); // retried hook must be a no-op
    expect((await creditService.getWallet(user.id)).balance).toBe(FREE_SIGNUP_CREDITS);
  });

  it("returns 404 for another user's book and chapter", async () => {
    const a = await createUser("owner");
    const b = await createUser("intruder");
    const bookId = await bookWithOutline(a.agent);
    await a.agent.post(`/api/v1/books/${bookId}/outline/approve`).set("Origin", ORIGIN).send({ version: 1 }).expect(200);
    const chapter = await prisma.chapter.findFirstOrThrow({ where: { bookId } });

    expect((await b.agent.get(`/api/v1/books/${bookId}`)).status).toBe(404);
    expect((await b.agent.get(`/api/v1/chapters/${chapter.id}`)).status).toBe(404);
    await b.agent.get(`/api/v1/books/${bookId}/publishing-checks?destination=etsy`).expect(404);
    await a.agent.get(`/api/v1/books/${bookId}/publishing-checks?destination=unknown`).expect(400);
    const report = (await a.agent.get(`/api/v1/books/${bookId}/publishing-checks?destination=kdp_ebook`).expect(200)).body.report;
    expect(report.status).toBe('blocked');
    expect(report.chapterVersions).toHaveLength(3);
    expect(report.checks.some((c: { id: string; status: string }) => c.id === 'format' && c.status === 'blocker')).toBe(true);
    expect((await b.agent.patch(`/api/v1/chapters/${chapter.id}`).set("Origin", ORIGIN).send({ version: 0, title: "hacked" })).status).toBe(404);
    expect((await b.agent.post(`/api/v1/books/${bookId}/generate`).set("Origin", ORIGIN)).status).toBe(404);
  });

  it("validates request bodies", async () => {
    const { agent } = await createUser("validation");
    const res = await agent.post("/api/v1/books").set("Origin", ORIGIN).send({ brief: { topic: "x", language: "klingon" } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(["brief.topic", "brief.language"]));
  });

  it("refuses an empty project id as a bad request rather than a server fault", async () => {
    // The books table carries a foreign key to projects, so an empty string is
    // not a project id. It used to reach the database and surface as a 500.
    const { agent } = await createUser("empty-project");
    const res = await agent.post("/api/v1/books").set("Origin", ORIGIN).send({ ...brief(), projectId: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(["projectId"]));
  });

  it("accepts a null project id, which means the book is filed under no project", async () => {
    const { agent } = await createUser("null-project");
    const res = await agent.post("/api/v1/books").set("Origin", ORIGIN).send({ ...brief(), projectId: null });
    expect(res.status).toBe(201);
    expect(res.body.book.projectId).toBeNull();
  });
});

describe("book pipeline", () => {
  it("outline → approve → write → credits charged exactly", async () => {
    const { agent, user } = await createUser("pipeline");
    const bookId = await bookWithOutline(agent, { language: "bn" });

    const book = (await agent.get(`/api/v1/books/${bookId}`)).body.book;
    expect(book.status).toBe("outline_ready");
    expect(book.outline.data.chapters).toHaveLength(3);

    // Generation requires approval
    expect((await agent.post(`/api/v1/books/${bookId}/generate`).set("Origin", ORIGIN)).status).toBe(409);
    await agent.post(`/api/v1/books/${bookId}/outline/approve`).set("Origin", ORIGIN).send({ version: 1 }).expect(200);

    const start = await agent.post(`/api/v1/books/${bookId}/generate`).set("Origin", ORIGIN);
    expect(start.status).toBe(202);
    // A second start while one is active is rejected
    expect((await agent.post(`/api/v1/books/${bookId}/generate`).set("Origin", ORIGIN)).status).toBe(409);

    await generationService.process(start.body.job.id);

    const chapters = await prisma.chapter.findMany({ where: { bookId } });
    expect(chapters.every((c) => c.status === "done" && c.wordCount > 0 && c.summary)).toBe(true);
    const expected = FREE_SIGNUP_CREDITS - CREDIT_COSTS.outline - 3 * chapterCredits(800);
    const wallet = await creditService.getWallet(user.id);
    expect(wallet).toMatchObject({ balance: expected, reserved: 0 });
    expect((await agent.get(`/api/v1/books/${bookId}`)).body.book.status).toBe("written");
  });

  it("resumes after a crash without rewriting or double-charging finished chapters", async () => {
    const { agent, user } = await createUser("restart");
    const bookId = await bookWithOutline(agent);
    await agent.post(`/api/v1/books/${bookId}/outline/approve`).set("Origin", ORIGIN).send({ version: 1 }).expect(200);
    const start = await agent.post(`/api/v1/books/${bookId}/generate`).set("Origin", ORIGIN).expect(202);
    const jobId = start.body.job.id;

    // Simulate a worker that finished chapter 1, then crashed mid-job.
    const first = await prisma.chapter.findFirstOrThrow({ where: { bookId, position: 0 } });
    const marker = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "written before crash" }] }] };
    await prisma.$transaction([
      prisma.chapter.update({ where: { id: first.id }, data: { status: "done", contentJson: marker, wordCount: 3 } }),
      prisma.generationSection.create({ data: { jobId, chapterId: first.id, kind: "committed", position: 0, text: "Saved before interruption", model: "mock" } }),
      prisma.generationJob.update({ where: { id: jobId }, data: { status: "running", progress: 1, creditsCharged: chapterCredits(800) } }),
    ]);

    await generationService.process(jobId); // BullMQ re-delivers the stalled job
    await generationService.process(jobId); // ...and a duplicate delivery is a no-op

    const after = await prisma.chapter.findUniqueOrThrow({ where: { id: first.id } });
    expect(after.contentJson).toEqual(marker);
    const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job).toMatchObject({ status: "completed", progress: 3, creditsCharged: 3 * chapterCredits(800) });
    expect((await creditService.getWallet(user.id)).balance).toBe(FREE_SIGNUP_CREDITS - CREDIT_COSTS.outline - 3 * chapterCredits(800));
  });

  it("refunds everything when a queued job is cancelled", async () => {
    const { agent, user } = await createUser("cancel");
    const bookId = await bookWithOutline(agent);
    await agent.post(`/api/v1/books/${bookId}/outline/approve`).set("Origin", ORIGIN).send({ version: 1 }).expect(200);
    await agent.post(`/api/v1/books/${bookId}/generate`).set("Origin", ORIGIN).expect(202);
    expect((await creditService.getWallet(user.id)).reserved).toBeGreaterThan(0);

    const res = await agent.post(`/api/v1/books/${bookId}/generate/cancel`).set("Origin", ORIGIN);
    expect(res.status).toBe(200);
    expect(res.body.job.status).toBe("cancelled");
    expect(await creditService.getWallet(user.id)).toMatchObject({ balance: FREE_SIGNUP_CREDITS - CREDIT_COSTS.outline, reserved: 0 });
  });

  it("keeps one section when two workers write the same section at once", async () => {
    const { agent } = await createUser("race");
    const bookId = await bookWithOutline(agent);
    await agent.post(`/api/v1/books/${bookId}/outline/approve`).set("Origin", ORIGIN).send({ version: 1 }).expect(200);
    const start = await agent.post(`/api/v1/books/${bookId}/generate`).set("Origin", ORIGIN).expect(202);
    const jobId = start.body.job.id;
    const chapter = await prisma.chapter.findFirstOrThrow({ where: { bookId } });

    // The job lease can lapse while a provider call is in flight, so a second
    // worker picks the job up and writes the same section. Both writes must
    // resolve to one stored section instead of failing the run.
    const key = { jobId, chapterId: chapter.id, kind: "section", position: 0 };
    const insert = (text: string) =>
      prisma.$executeRaw`
        INSERT INTO generation_sections ("id", "jobId", "chapterId", "kind", "position", "text", "inputTokens", "outputTokens", "model", "createdAt")
        VALUES (${crypto.randomUUID()}, ${key.jobId}, ${key.chapterId}, ${key.kind}, ${key.position}, ${text}, 0, 0, 'mock', NOW())
        ON CONFLICT ("jobId", "chapterId", "kind", "position") DO NOTHING
      `;
    const results = await Promise.allSettled([insert("first"), insert("second"), insert("third")]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const stored = await prisma.generationSection.findMany({ where: { jobId, chapterId: chapter.id, kind: "section", position: 0 } });
    expect(stored).toHaveLength(1);
  });

  it("reuses the sections a failed run saved and only charges for new prose", async () => {
    const { agent, user } = await createUser("resume");
    const bookId = await bookWithOutline(agent);
    await agent.post(`/api/v1/books/${bookId}/outline/approve`).set("Origin", ORIGIN).send({ version: 1 }).expect(200);
    const first = await agent.post(`/api/v1/books/${bookId}/generate`).set("Origin", ORIGIN).expect(202);
    const failedJobId = first.body.job.id;
    const chapter = await prisma.chapter.findFirstOrThrow({ where: { bookId, position: 0 } });

    // The run stops after the first section of the first chapter was written.
    await prisma.generationSection.create({ data: { jobId: failedJobId, chapterId: chapter.id, kind: "section", position: 0, text: "Written before the failure", model: "mock" } });
    await prisma.generationJob.update({ where: { id: failedJobId }, data: { status: "failed", error: "provider connection lost" } });
    // The failed run releases its reservation the same way the worker does.
    await creditService.settle(user.id, 3 * chapterCredits(800), 0, `job:${failedJobId}`);

    const retry = await agent.post(`/api/v1/books/${bookId}/generate`).set("Origin", ORIGIN).expect(202);
    const retryJobId = retry.body.job.id;
    const inherited = await prisma.generationSection.findFirst({ where: { jobId: retryJobId, chapterId: chapter.id, kind: "section", position: 0 } });
    expect(inherited?.text).toBe("Written before the failure");

    // Only the sections this run has to write are reserved.
    const retryJob = await prisma.generationJob.findUniqueOrThrow({ where: { id: retryJobId } });
    expect(retryJob.creditsReserved).toBeLessThan(3 * chapterCredits(800));

    await generationService.process(retryJobId);
    const after = await prisma.chapter.findUniqueOrThrow({ where: { id: chapter.id } });
    expect(after.status).toBe("done");
    expect(after.contentJson).toBeTruthy();
    // The reused section was charged once, when it was first written.
    const wallet = await creditService.getWallet(user.id);
    expect(wallet.reserved).toBe(0);
    // The retry billed only the prose it had to write.
    const retryJobAfter = await prisma.generationJob.findUniqueOrThrow({ where: { id: retryJobId } });
    expect(retryJobAfter.creditsCharged).toBeLessThan(3 * chapterCredits(800));
  });

  it("returns 402 and leaves no job behind when credits are insufficient", async () => {
    const { agent, user } = await createUser("broke");
    const bookId = await bookWithOutline(agent, { chapterCount: 10, wordsPerChapter: 5000 });
    await agent.post(`/api/v1/books/${bookId}/outline/approve`).set("Origin", ORIGIN).send({ version: 1 }).expect(200);
    const res = await agent.post(`/api/v1/books/${bookId}/generate`).set("Origin", ORIGIN);
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("INSUFFICIENT_CREDITS");
    expect(await prisma.generationJob.count({ where: { bookId, type: "chapters" } })).toBe(0);
    expect((await creditService.getWallet(user.id)).reserved).toBe(0);
  });
});

describe("editor", () => {
  it("rejects stale saves with 409 (optimistic concurrency)", async () => {
    const { agent } = await createUser("occ");
    const bookId = await bookWithOutline(agent);
    await agent.post(`/api/v1/books/${bookId}/outline/approve`).set("Origin", ORIGIN).send({ version: 1 }).expect(200);
    const ch = await prisma.chapter.findFirstOrThrow({ where: { bookId } });
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Tab A wrote this" }] }] };

    const a = await agent.patch(`/api/v1/chapters/${ch.id}`).set("Origin", ORIGIN).send({ version: ch.version, contentJson: doc });
    expect(a.status).toBe(200);
    expect(a.body.chapter).toMatchObject({ version: ch.version + 1, wordCount: 4, status: "done" });

    const b = await agent.patch(`/api/v1/chapters/${ch.id}`).set("Origin", ORIGIN).send({ version: ch.version, title: "Tab B" });
    expect(b.status).toBe(409);
    expect(b.body.error.details.currentVersion).toBe(ch.version + 1);
    expect(b.body.error.details.contentJson).toEqual(doc);
  });

  it("preserves revisions, restores with OCC, and isolates history by owner and chapter", async () => {
    const { agent } = await createUser("history");
    const other = await createUser("history-other");
    const bookId = await bookWithOutline(agent);
    await agent.post(`/api/v1/books/${bookId}/outline/approve`).set("Origin", ORIGIN).send({ version: 1 }).expect(200);
    const [ch, second] = await prisma.chapter.findMany({ where: { bookId }, orderBy: { position: "asc" } });
    const url = `/api/v1/chapters/${ch.id}`;
    const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
    await agent.patch(url).set("Origin", ORIGIN).send({ version: ch.version, title: "First draft", contentJson: doc("Original content") }).expect(200);
    await agent.patch(url).set("Origin", ORIGIN).send({ version: ch.version + 1, title: "Second draft", contentJson: doc("Revised content here") }).expect(200);
    const history = await agent.get(`${url}/versions`).expect(200);
    expect(history.body.versions.map((r: { version: number }) => r.version)).toEqual([ch.version + 1, ch.version]);
    expect(history.body.versions[0]).not.toHaveProperty("contentJson");
    const revisionId = history.body.versions[0].id;
    const revisionUrl = `${url}/versions/${revisionId}`;
    expect((await agent.get(revisionUrl).expect(200)).body.revision.contentJson).toEqual(doc("Original content"));
    await other.agent.get(`${url}/versions`).expect(404);
    await other.agent.get(revisionUrl).expect(404);
    await other.agent.post(`${revisionUrl}/restore`).set("Origin", ORIGIN).send({ version: ch.version + 2 }).expect(404);
    await agent.get(`/api/v1/chapters/${second.id}/versions/${revisionId}`).expect(404);
    await agent.post(`${revisionUrl}/restore`).set("Origin", ORIGIN).send({ version: ch.version }).expect(409);
    expect(await prisma.documentVersion.count({ where: { chapterId: ch.id } })).toBe(2);
    await agent.post(`${revisionUrl}/restore`).set("Origin", ORIGIN).send({ version: ch.version + 2 }).expect(200);
    const restored = (await agent.get(url).expect(200)).body.chapter;
    expect(restored).toMatchObject({ title: "First draft", version: ch.version + 3, wordCount: 2, contentJson: doc("Original content") });
    const preserved = (await agent.get(`${url}/versions`).expect(200)).body.versions[0];
    expect((await agent.get(`${url}/versions/${preserved.id}`).expect(200)).body.revision.contentJson).toEqual(doc("Revised content here"));
    const older = (await agent.get(`${url}/versions?before=${ch.version + 1}`).expect(200)).body.versions;
    expect(older.map((r: { version: number }) => r.version)).toEqual([ch.version]);
    await agent.get(`${url}/versions?before=invalid`).expect(400);
    await agent.post(`${revisionUrl}/restore`).set("Origin", ORIGIN).send({ version: -1 }).expect(400);

    // An empty original draft remains restorable, and the restored draft can be edited again.
    const emptyRevision = history.body.versions[1].id;
    await agent.post(`${url}/versions/${emptyRevision}/restore`).set("Origin", ORIGIN).send({ version: restored.version }).expect(200);
    const empty = (await agent.get(url).expect(200)).body.chapter;
    expect(empty).toMatchObject({ wordCount: 0, status: "pending", version: restored.version + 1 });
    await agent.patch(url).set("Origin", ORIGIN).send({ version: empty.version, contentJson: doc("Writing again") }).expect(200);
    await agent.delete(`/api/v1/books/${bookId}`).set("Origin", ORIGIN).expect(204);
    await agent.get(`${url}/versions`).expect(404);
  });

  it("records only the winning edit when two saves race", async () => {
    const { agent } = await createUser("history-race");
    const bookId = await bookWithOutline(agent);
    await agent.post(`/api/v1/books/${bookId}/outline/approve`).set("Origin", ORIGIN).send({ version: 1 }).expect(200);
    const ch = await prisma.chapter.findFirstOrThrow({ where: { bookId } });
    const results = await Promise.all(["A", "B"].map((title) => agent.patch(`/api/v1/chapters/${ch.id}`).set("Origin", ORIGIN).send({ version: ch.version, title })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.documentVersion.count({ where: { chapterId: ch.id } })).toBe(1);
  });

  it("rejects malformed documents", async () => {
    const { agent } = await createUser("baddoc");
    const bookId = await bookWithOutline(agent);
    await agent.post(`/api/v1/books/${bookId}/outline/approve`).set("Origin", ORIGIN).send({ version: 1 }).expect(200);
    const ch = await prisma.chapter.findFirstOrThrow({ where: { bookId } });
    const res = await agent.patch(`/api/v1/chapters/${ch.id}`).set("Origin", ORIGIN).send({ version: ch.version, contentJson: { type: "paragraph" } });
    expect(res.status).toBe(400);
  });

  it("AI assist returns a suggestion and charges one credit per request", async () => {
    const { agent, user } = await createUser("assist");
    const bookId = await bookWithOutline(agent);
    const before = (await creditService.getWallet(user.id)).balance;
    const res = await agent.post("/api/v1/ai/assist").set("Origin", ORIGIN).set("Idempotency-Key", "k1").send({ bookId, action: "to_bullets", text: "One. Two." });
    expect(res.status).toBe(200);
    expect(res.body.content[0].type).toBe("bulletList");
    // Same idempotency key is not charged twice
    await agent.post("/api/v1/ai/assist").set("Origin", ORIGIN).set("Idempotency-Key", "k1").send({ bookId, action: "to_bullets", text: "One. Two." });
    expect((await creditService.getWallet(user.id)).balance).toBe(before - CREDIT_COSTS.assist);
  });
});

describe("credit ledger", () => {
  it("reserve and settle are idempotent", async () => {
    const { user } = await createUser("ledger");
    await creditService.reserve(user.id, 30, `job:test-1:${user.id}`);
    await creditService.reserve(user.id, 30, `job:test-1:${user.id}`);
    expect(await creditService.getWallet(user.id)).toMatchObject({ balance: FREE_SIGNUP_CREDITS - 30, reserved: 30 });

    await creditService.settle(user.id, 30, 12, `job:test-1:${user.id}`);
    await creditService.settle(user.id, 30, 12, `job:test-1:${user.id}`);
    expect(await creditService.getWallet(user.id)).toMatchObject({ balance: FREE_SIGNUP_CREDITS - 12, reserved: 0 });
  });

  it("never lets concurrent reservations overspend", async () => {
    const { user } = await createUser("race");
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => creditService.reserve(user.id, 40, `job:race-${user.id}-${i}`)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const wallet = await creditService.getWallet(user.id);
    expect(wallet.balance).toBe(FREE_SIGNUP_CREDITS - 80);
    expect(wallet.balance).toBeGreaterThanOrEqual(0);
  });
});
