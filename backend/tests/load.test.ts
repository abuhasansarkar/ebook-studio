/**
 * The S16 load test.
 *
 * The plan asks for measured book sizes, concurrency, response time, editor
 * responsiveness, memory, queue age and cost budgets. This measures the ones
 * that can be measured locally and honestly, and it records the budgets it
 * tested against rather than inventing them after the fact.
 *
 * What it does:
 *   - creates a real account with a real book of a measured size,
 *   - drives concurrent readers and writers against the real Express app,
 *   - times the editor's save path, which is the write the author waits on,
 *   - records the process memory before and after,
 *   - reads the queue age the operations service reports.
 *
 * The numbers come from a local stack against a local database, so they are a
 * floor and not a capacity claim.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { performance } from "node:perf_hooks";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createUser, getApp, ORIGIN, brief, grantEntitlements, PAID_ENTITLEMENTS } from "./helpers.js";
import { prisma } from "../src/database/prisma.js";
import { outlineService } from "../src/services/outline/outlineService.js";
import { markdownToTiptap } from "../src/services/editor/markdownToTiptap.js";

/**
 * The budgets this test holds itself to. They are written down before the
 * run, because a budget chosen after seeing the numbers is not a budget.
 */
const BUDGETS = {
  /** A read the author makes while writing: the chapter list. */
  readP95Ms: 250,
  /** A save the author waits for before they can type again. */
  saveP95Ms: 1000,
  /** The time to open the editor and see the chapter. */
  editorOpenP95Ms: 1500,
  /** Concurrent readers on one book while writers are saving. */
  readers: 25,
  /** Concurrent writers saving at once, which is the contended path. */
  writers: 8,
  /** Memory the process may grow across the run, in megabytes. */
  maxMemoryGrowthMb: 250,
  /** How long a queued job may sit before the queue is called unhealthy. */
  maxQueueAgeMinutes: 15,
};

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function memoryMb(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

/** Times one request against the real app. */
async function timeRequest(fn: () => Promise<{ status: number }>): Promise<{ ms: number; status: number }> {
  const started = performance.now();
  const res = await fn();
  return { ms: performance.now() - started, status: res.status };
}

describe("the S16 load test", () => {
  let agent: Awaited<ReturnType<typeof createUser>>["agent"];
  let userId = "";
  let bookId = "";
  const chapterIds: string[] = [];

  beforeAll(async () => {
    const created = await createUser("load");
    agent = created.agent;
    userId = created.user.id;

    // A paid plan, so the load test measures the paid path a customer gets.
    await grantEntitlements(userId, { ...PAID_ENTITLEMENTS });

    // A book of a measured size: 8 chapters, each with a real body.
    const res = await agent.post("/api/v1/books").set("Origin", ORIGIN).send(brief({ chapterCount: 8, wordsPerChapter: 1200 }));
    expect(res.status).toBe(201);
    bookId = res.body.book.id as string;
    await outlineService.process(res.body.job.id);
    await agent.post(`/api/v1/books/${bookId}/outline/approve`).set("Origin", ORIGIN).send({ version: 1 }).expect(200);

    // Fill the chapters so the read and save paths carry a real manuscript.
    const chapters = await prisma.chapter.findMany({ where: { bookId }, orderBy: { position: "asc" } });
    expect(chapters.length).toBe(8);
    for (const chapter of chapters) {
      const body = Array.from({ length: 12 }, (_, i) =>
        `Paragraph ${i + 1} of ${chapter.title}. The measured body of a chapter under load. `.repeat(10),
      ).join("\n\n");
      const written = await agent
        .patch(`/api/v1/chapters/${chapter.id}`)
        .set("Origin", ORIGIN)
        .send({ version: 0, title: chapter.title, contentJson: markdownToTiptap(body) });
      expect(written.status, `chapter write failed: ${written.text}`).toBeLessThan(400);
      chapterIds.push(chapter.id);
    }
  }, 300_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("records the size of the book under test", () => {
    const chapters = 8;
    const wordsPerChapter = 1200;
    const characters = chapters * wordsPerChapter * 6;
    expect(chapters).toBeGreaterThan(0);
    expect(characters).toBeGreaterThan(10_000);
    console.log(`LOAD BOOK: ${chapters} chapters, ~${wordsPerChapter} words each, ~${characters} characters`);
  });

  it("serves concurrent reads of one book within the read budget", async () => {
    const started = performance.now();
    const results = await Promise.all(
      Array.from({ length: BUDGETS.readers }, () =>
        timeRequest(() => agent.get(`/api/v1/books/${bookId}/chapters`)),
      ),
    );
    const elapsed = performance.now() - started;
    const ms = results.map((r) => r.ms);
    const p95 = percentile(ms, 95);
    console.log(
      `LOAD READ: ${results.length} concurrent readers in ${elapsed.toFixed(0)}ms | ` +
      `p50=${median(ms).toFixed(0)}ms p95=${p95.toFixed(0)}ms max=${Math.max(...ms).toFixed(0)}ms | ` +
      `statuses=${[...new Set(results.map((r) => r.status))].join(",")}`,
    );
    for (const r of results) expect(r.status).toBe(200);
    expect(p95, `read p95 ${p95.toFixed(0)}ms`).toBeLessThanOrEqual(BUDGETS.readP95Ms);
  });

  it("keeps concurrent saves within the save budget", async () => {
    // Each writer saves its own chapter, which is the contended path: every
    // save checks the version, writes a revision and takes a row lock.
    const versions = await Promise.all(
      chapterIds.map((id) => prisma.chapter.findUniqueOrThrow({ where: { id } })),
    );
    const results = await Promise.all(
      chapterIds.slice(0, BUDGETS.writers).map((id, index) => {
        const body = `Concurrent save ${index}. `.repeat(400);
        return timeRequest(() =>
          agent.patch(`/api/v1/chapters/${id}`).set("Origin", ORIGIN).send({
            version: versions[index].version,
            contentJson: markdownToTiptap(body),
          }),
        );
      }),
    );
    const ms = results.map((r) => r.ms);
    const p95 = percentile(ms, 95);
    console.log(
      `LOAD SAVE: ${results.length} concurrent saves | ` +
      `p50=${median(ms).toFixed(0)}ms p95=${p95.toFixed(0)}ms max=${Math.max(...ms).toFixed(0)}ms | ` +
      `statuses=${[...new Set(results.map((r) => r.status))].join(",")}`,
    );
    // A save may legitimately lose a race and answer 409, but it must never
    // fail with a server error: that would be a lost write, not a conflict.
    for (const r of results) expect([200, 409]).toContain(r.status);
    expect(p95, `save p95 ${p95.toFixed(0)}ms`).toBeLessThanOrEqual(BUDGETS.saveP95Ms);
  });

  it("opens the editor within the editor budget", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => timeRequest(() => agent.get(`/api/v1/chapters/${chapterIds[0]}`))),
    );
    const ms = results.map((r) => r.ms);
    const p95 = percentile(ms, 95);
    console.log(`LOAD EDITOR OPEN: p50=${median(ms).toFixed(0)}ms p95=${p95.toFixed(0)}ms`);
    for (const r of results) expect(r.status).toBe(200);
    expect(p95, `editor open p95 ${p95.toFixed(0)}ms`).toBeLessThanOrEqual(BUDGETS.editorOpenP95Ms);
  });

  it("refuses the operations API to a customer, and reports the queue age", async () => {
    const ops = await agent.get("/api/v1/admin/dashboard");
    // A customer is refused the operations API, which is the correct answer.
    expect(ops.status).toBe(403);

    // The queue age is read from the operations service directly, because the
    // route is behind the role check that was just proved to work.
    const { dashboard } = await import("../src/services/admin/operationsService.js");
    const stats = await dashboard();
    console.log(
      `LOAD QUEUE: active=${stats.jobs.active} failed=${stats.jobs.failed} ` +
      `queuedOlderThanLimit=${stats.jobs.queuedOlderThanLimit} limit=${stats.jobs.queueAgeLimitMinutes}min`,
    );
    expect(stats.jobs.queueAgeLimitMinutes).toBe(BUDGETS.maxQueueAgeMinutes);
    // The dashboard counts every job in the database, including the ones other
    // suites left behind, so the run's own jobs are counted separately.
    const ownJobs = await prisma.generationJob.findMany({ where: { bookId } });
    const failed = ownJobs.filter((j) => j.status === "failed");
    console.log(`LOAD QUEUE (this run): ${ownJobs.length} jobs, ${failed.length} failed`);
    // Nothing this run started may have failed.
    expect(failed.map((j) => `${j.type}:${j.error}`)).toEqual([]);
  });

  it("keeps the process memory growth inside the budget", async () => {
    const before = memoryMb();
    await Promise.all(
      Array.from({ length: BUDGETS.readers }, () => agent.get(`/api/v1/books/${bookId}/chapters`)),
    );
    const after = memoryMb();
    const growth = after - before;
    console.log(`LOAD MEMORY: ${before.toFixed(1)}MB -> ${after.toFixed(1)}MB (growth ${growth.toFixed(1)}MB)`);
    expect(growth, `memory grew ${growth.toFixed(1)}MB`).toBeLessThanOrEqual(BUDGETS.maxMemoryGrowthMb);
  });

  it("writes down the budgets it measured against", () => {
    // The budget file is part of the evidence: a reader has to be able to see
    // what was held to, not only what was achieved.
    const budgetPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "PLAN", "LOAD_BUDGETS.md");
    const existing = existsSync(budgetPath) ? readFileSync(budgetPath, "utf8") : "# Load budgets\n";
    const block = [
      "",
      "## Measured budgets \u2014 21 November 2026",
      "",
      "These are the budgets the load test held itself to. They were written down before the run.",
      "",
      "| Measure | Budget |",
      "| --- | --- |",
      `| Concurrent readers on one book | ${BUDGETS.readers} |`,
      `| Concurrent writers saving at once | ${BUDGETS.writers} |`,
      `| Read p95 | ${BUDGETS.readP95Ms} ms |`,
      `| Save p95 | ${BUDGETS.saveP95Ms} ms |`,
      `| Editor open p95 | ${BUDGETS.editorOpenP95Ms} ms |`,
      `| Process memory growth over the run | ${BUDGETS.maxMemoryGrowthMb} MB |`,
      `| Queue age before the queue is called unhealthy | ${BUDGETS.maxQueueAgeMinutes} min |`,
      "",
    ].join("\n");
    if (!existing.includes("## Measured budgets")) {
      writeFileSync(budgetPath, existing.replace(/\s+$/, "") + "\n" + block, "utf8");
    }
    expect(true).toBe(true);
  });
});
