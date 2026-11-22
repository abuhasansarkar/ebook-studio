import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { COLORING_GENERATION_FAILED_MESSAGE } from "@ebook/shared";

const rendered = vi.hoisted(() => ({ html: [] as string[] }));
vi.mock("../src/services/exports/pdfRenderer.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/services/exports/pdfRenderer.js")>();
  return {
    ...original,
    renderPdf: async (html: string) => {
      rendered.html.push(html);
      return { buffer: Buffer.from("%PDF-1.4 coloring test document"), pageCount: 50 };
    },
  };
});

import { prisma } from "../src/database/prisma.js";
import { closeQueues } from "../src/queues/index.js";
import { creditService } from "../src/services/credits/creditService.js";
import { storage } from "../src/services/storage/storage.js";
import { coloringGenerationService, COLORING_STALE_MS } from "../src/services/coloring/coloringGenerationService.js";
import { coloringQualityService } from "../src/services/coloring/coloringQualityService.js";
import { createUser, grantEntitlements, ORIGIN } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
});

type Agent = Awaited<ReturnType<typeof createUser>>["agent"];

async function author(prefix: string, balance = 200) {
  const owner = await createUser(prefix);
  await prisma.creditWallet.upsert({
    where: { userId: owner.user.id },
    create: { userId: owner.user.id, balance },
    update: { balance, reserved: 0 },
  });
  return owner;
}

async function createBook(agent: Agent, extra: Record<string, unknown> = {}) {
  const res = await agent
    .post("/api/v1/coloring/plan")
    .set("Origin", ORIGIN)
    .send({ topic: "Friendly dinosaurs at a picnic", pageCount: 24, ...extra })
    .expect(201);
  return { bookId: res.body.book.id as string, pages: res.body.pages as { id: string; pageNumber: number }[] };
}

/** A ready image owned by `userId`, as an upload would leave it. */
async function ownedAsset(userId: string, provenance = "user_upload") {
  const data = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ffffff" } }).webp().toBuffer();
  const storageKey = `assets/${userId}/${randomUUID()}.webp`;
  await storage.put(storageKey, data, "image/webp");
  return prisma.asset.create({
    data: { userId, storageKey, sha256: createHash("sha256").update(data).digest("hex"), width: 64, height: 64, bytes: data.length, status: "ready", provenance },
  });
}

async function generate(agent: Agent, bookId: string, pageId: string, status = 202) {
  return agent.post(`/api/v1/coloring/books/${bookId}/pages/${pageId}/generate`).set("Origin", ORIGIN).send({}).expect(status);
}

async function runQueued(pageId: string) {
  const page = await prisma.coloringPage.findUniqueOrThrow({ where: { id: pageId } });
  expect(page.generationJobId).toBeTruthy();
  await coloringGenerationService.process(page.generationJobId!);
  return page.generationJobId!;
}

describe("coloring asset ownership (IDOR)", () => {
  it("refuses to place another user's image on a page and never reads one into clean, export or plan", async () => {
    const victim = await author("coloring-victim");
    const attacker = await author("coloring-attacker");
    await grantEntitlements(attacker.user.id, { exports: true });
    const secret = await ownedAsset(victim.user.id);
    const { bookId, pages } = await createBook(attacker.agent);
    const page = pages[0];

    await attacker.agent
      .patch(`/api/v1/coloring/books/${bookId}/pages/${page.id}`)
      .set("Origin", ORIGIN)
      .send({ assetId: secret.id })
      .expect(404);
    expect((await prisma.coloringPage.findUniqueOrThrow({ where: { id: page.id } })).assetId).toBeNull();
    expect(await prisma.assetReference.count({ where: { assetId: secret.id } })).toBe(0);

    // A page that already points at a foreign image (written before this fix) stays inert.
    await prisma.coloringPage.update({ where: { id: page.id }, data: { assetId: secret.id, status: "completed" } });
    const detail = await attacker.agent.get(`/api/v1/coloring/books/${bookId}`).set("Origin", ORIGIN).expect(200);
    const shown = detail.body.pages.find((p: { id: string }) => p.id === page.id);
    expect(shown.assetId).toBeNull();
    expect(shown.asset).toBeNull();
    await attacker.agent.post(`/api/v1/coloring/books/${bookId}/pages/${page.id}/clean`).set("Origin", ORIGIN).expect(404);
    await attacker.agent.post(`/api/v1/coloring/books/${bookId}/export/compile`).set("Origin", ORIGIN).expect(400);
    expect(await prisma.asset.count({ where: { userId: attacker.user.id } })).toBe(0);
  });

  it("accepts the author's own image and pins it to the book", async () => {
    const owner = await author("coloring-own-asset");
    const mine = await ownedAsset(owner.user.id);
    const { bookId, pages } = await createBook(owner.agent);
    const res = await owner.agent
      .patch(`/api/v1/coloring/books/${bookId}/pages/${pages[0].id}`)
      .set("Origin", ORIGIN)
      .send({ assetId: mine.id })
      .expect(200);
    expect(res.body.page.assetId).toBe(mine.id);
    expect(res.body.page.status).toBe("completed");
    expect(await prisma.assetReference.count({ where: { assetId: mine.id, bookId } })).toBe(1);
  });

  it("never returns storage keys from plan, cover and export responses", async () => {
    const owner = await author("coloring-keys");
    await grantEntitlements(owner.user.id, { exports: true });
    const { bookId, pages } = await createBook(owner.agent);
    await generate(owner.agent, bookId, pages[0].id);
    await runQueued(pages[0].id);
    await owner.agent.post(`/api/v1/coloring/books/${bookId}/cover`).set("Origin", ORIGIN).send({}).expect(200);

    const detail = await owner.agent.get(`/api/v1/coloring/books/${bookId}`).set("Origin", ORIGIN).expect(200);
    const cover = await owner.agent.get(`/api/v1/coloring/books/${bookId}/cover`).set("Origin", ORIGIN).expect(200);
    const compiled = await owner.agent.post(`/api/v1/coloring/books/${bookId}/export/compile`).set("Origin", ORIGIN).expect(200);
    for (const body of [detail.body, cover.body, compiled.body]) expect(JSON.stringify(body)).not.toContain("storageKey");
    expect(cover.body.coverArtworkAsset.id).toBeTruthy();
    expect(cover.body.sampleThumbnails[0].assetId).toBeTruthy();
  });
});

describe("coloring project ownership", () => {
  it("refuses to file a coloring book under another user's project", async () => {
    const other = await author("coloring-project-owner");
    const project = await prisma.project.create({ data: { userId: other.user.id, name: "Private" } });
    const owner = await author("coloring-project-thief");
    await owner.agent
      .post("/api/v1/coloring/plan")
      .set("Origin", ORIGIN)
      .send({ topic: "Sleepy owls in the forest", projectId: project.id })
      .expect(404);
    expect(await prisma.book.count({ where: { projectId: project.id } })).toBe(0);

    const mine = await prisma.project.create({ data: { userId: owner.user.id, name: "Mine" } });
    const { bookId } = await createBook(owner.agent, { projectId: mine.id });
    expect((await prisma.book.findUniqueOrThrow({ where: { id: bookId } })).projectId).toBe(mine.id);
  });
});

describe("coloring print HTML", () => {
  it("escapes titles, subtitles, page titles and captions and pins a CSP", async () => {
    const owner = await author("coloring-xss");
    await grantEntitlements(owner.user.id, { exports: true });
    const { bookId, pages } = await createBook(owner.agent);
    await owner.agent
      .patch(`/api/v1/coloring/books/${bookId}/plan`)
      .set("Origin", ORIGIN)
      .send({ title: "<script>alert(1)</script>", subtitle: "<img src=x onerror=alert(2)>" })
      .expect(200);
    await owner.agent
      .patch(`/api/v1/coloring/books/${bookId}/pages/${pages[0].id}`)
      .set("Origin", ORIGIN)
      .send({ title: '" onload="alert(3)', caption: "<b>hi</b>" })
      .expect(200);
    await generate(owner.agent, bookId, pages[0].id);
    await runQueued(pages[0].id);

    rendered.html.length = 0;
    await owner.agent.post(`/api/v1/coloring/books/${bookId}/export/compile`).set("Origin", ORIGIN).expect(200);
    const html = rendered.html[0];
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain('" onload="');
    expect(html).not.toContain("<b>hi</b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('alt="&quot; onload=&quot;alert(3)"');
  });
});

describe("background coloring generation", () => {
  it("queues a page, refuses a duplicate while generating, charges once even if redelivered", async () => {
    const owner = await author("coloring-queue", 100);
    const { bookId, pages } = await createBook(owner.agent);
    const page = pages[0];

    const accepted = await generate(owner.agent, bookId, page.id);
    expect(accepted.body).toMatchObject({ queued: 1, creditsReserved: 8, skipped: [] });
    await generate(owner.agent, bookId, page.id, 409);
    expect(await prisma.creditWallet.findUniqueOrThrow({ where: { userId: owner.user.id } })).toMatchObject({ balance: 92, reserved: 8 });

    const jobId = await runQueued(page.id);
    await coloringGenerationService.process(jobId); // a BullMQ redelivery is a no-op
    expect(await prisma.creditWallet.findUniqueOrThrow({ where: { userId: owner.user.id } })).toMatchObject({ balance: 92, reserved: 0 });
    expect(await prisma.creditTransaction.count({ where: { reference: `job:${jobId}`, type: "reserve" } })).toBe(1);
    const done = await prisma.coloringPage.findUniqueOrThrow({ where: { id: page.id } });
    expect(done).toMatchObject({ status: "completed", generationJobId: null, error: null });
    expect(await prisma.asset.count({ where: { userId: owner.user.id, status: "ready" } })).toBe(1);
  });

  it("serializes concurrent generate requests for the same page into one job", async () => {
    const owner = await author("coloring-race", 100);
    const { bookId, pages } = await createBook(owner.agent);
    const results = await Promise.all([1, 2, 3].map(() =>
      owner.agent.post(`/api/v1/coloring/books/${bookId}/pages/${pages[0].id}/generate`).set("Origin", ORIGIN).send({})));
    expect(results.map((r) => r.status).sort()).toEqual([202, 409, 409]);
    expect(await prisma.generationJob.count({ where: { bookId, type: "coloring_page" } })).toBe(1);
  });

  it("reserves per page for a batch and refuses the whole batch when credits are short", async () => {
    const poor = await author("coloring-batch-poor", 20);
    const short = await createBook(poor.agent);
    const refused = await poor.agent.post(`/api/v1/coloring/books/${short.bookId}/generate-batch`).set("Origin", ORIGIN).send({}).expect(402);
    expect(refused.body.error.details).toMatchObject({ required: 24 * 8, balance: 20 });
    expect(await prisma.coloringPage.count({ where: { bookId: short.bookId, status: "generating" } })).toBe(0);

    const owner = await author("coloring-batch", 100);
    const { bookId, pages } = await createBook(owner.agent);
    const ids = pages.slice(0, 3).map((p) => p.id);
    const res = await owner.agent.post(`/api/v1/coloring/books/${bookId}/generate-batch`).set("Origin", ORIGIN).send({ pageIds: ids }).expect(202);
    expect(res.body).toMatchObject({ queued: 3, creditsReserved: 24 });
    expect(await prisma.generationJob.count({ where: { bookId, type: "coloring_page", status: "queued" } })).toBe(3);
    expect(await prisma.creditWallet.findUniqueOrThrow({ where: { userId: owner.user.id } })).toMatchObject({ balance: 76, reserved: 24 });
    // Re-requesting the same pages while they generate queues nothing more.
    await owner.agent.post(`/api/v1/coloring/books/${bookId}/generate-batch`).set("Origin", ORIGIN).send({ pageIds: ids }).expect(409);
  });

  it("stores a generic error and refunds when the provider fails", async () => {
    const owner = await author("coloring-fail", 100);
    const { bookId, pages } = await createBook(owner.agent);
    await generate(owner.agent, bookId, pages[0].id);
    vi.spyOn(coloringQualityService, "inspectImage").mockRejectedValue(new Error("401 Incorrect API key sk-live-SECRET request req_abc123"));
    await runQueued(pages[0].id);

    const failed = await prisma.coloringPage.findUniqueOrThrow({ where: { id: pages[0].id } });
    expect(failed).toMatchObject({ status: "failed", error: COLORING_GENERATION_FAILED_MESSAGE, generationJobId: null });
    const detail = await owner.agent.get(`/api/v1/coloring/books/${bookId}`).set("Origin", ORIGIN).expect(200);
    expect(JSON.stringify(detail.body)).not.toContain("sk-live-SECRET");
    expect(await prisma.creditWallet.findUniqueOrThrow({ where: { userId: owner.user.id } })).toMatchObject({ balance: 100, reserved: 0 });
  });

  it("recovers pages abandoned by a previous release and legacy in-request generation", async () => {
    const owner = await author("coloring-recover", 100);
    const { bookId, pages } = await createBook(owner.agent);
    await generate(owner.agent, bookId, pages[0].id);
    const jobId = (await prisma.coloringPage.findUniqueOrThrow({ where: { id: pages[0].id } })).generationJobId!;
    const old = new Date(Date.now() - COLORING_STALE_MS - 60_000);
    // A deploy changed the runtime fingerprint: no compatible worker will take this job.
    await prisma.queueDispatch.updateMany({ where: { jobId }, data: { fingerprint: "previous-release" } });
    await prisma.$executeRaw`UPDATE generation_jobs SET "updatedAt" = ${old} WHERE id = ${jobId}`;

    // The pre-queue code path left a page generating with a timestamp-keyed reservation.
    const legacyRef = `coloring:${pages[1].id}:1700000000000`;
    await creditService.reserve(owner.user.id, 8, legacyRef);
    await prisma.coloringPage.update({ where: { id: pages[1].id }, data: { status: "generating" } });
    await prisma.$executeRaw`UPDATE coloring_pages SET "updatedAt" = ${old} WHERE id = ${pages[1].id}`;
    expect(await prisma.creditWallet.findUniqueOrThrow({ where: { userId: owner.user.id } })).toMatchObject({ balance: 84, reserved: 16 });

    // Reading the book self-heals it.
    const detail = await owner.agent.get(`/api/v1/coloring/books/${bookId}`).set("Origin", ORIGIN).expect(200);
    expect(detail.body.stats.generating).toBe(0);
    expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("failed");
    for (const id of [pages[0].id, pages[1].id]) {
      expect(await prisma.coloringPage.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "failed", error: COLORING_GENERATION_FAILED_MESSAGE });
    }
    expect(await prisma.creditWallet.findUniqueOrThrow({ where: { userId: owner.user.id } })).toMatchObject({ balance: 100, reserved: 0 });
    // A worker that comes back later cannot resurrect the failed job.
    await coloringGenerationService.process(jobId);
    expect((await prisma.coloringPage.findUniqueOrThrow({ where: { id: pages[0].id } })).status).toBe("failed");
  });

  it("does not recover a fresh queued job", async () => {
    const owner = await author("coloring-fresh", 100);
    const { bookId, pages } = await createBook(owner.agent);
    await generate(owner.agent, bookId, pages[0].id);
    expect((await coloringGenerationService.recoverStale({ bookId })).recovered).toBe(0);
    expect((await prisma.coloringPage.findUniqueOrThrow({ where: { id: pages[0].id } })).status).toBe("generating");
  });
});

describe("coloring auto-clean", () => {
  it("cleans once, releases the replaced image, and is idempotent", async () => {
    const owner = await author("coloring-clean", 100);
    const { bookId, pages } = await createBook(owner.agent);
    await generate(owner.agent, bookId, pages[0].id);
    await runQueued(pages[0].id);
    const original = (await prisma.coloringPage.findUniqueOrThrow({ where: { id: pages[0].id } })).assetId!;

    const first = await owner.agent.post(`/api/v1/coloring/books/${bookId}/pages/${pages[0].id}/clean`).set("Origin", ORIGIN).expect(200);
    expect(first.body.page.assetId).not.toBe(original);
    expect(JSON.stringify(first.body)).not.toContain("storageKey");
    expect(await prisma.assetReference.count({ where: { assetId: original } })).toBe(0);
    expect(["deleting", "deleted"]).toContain((await prisma.asset.findUniqueOrThrow({ where: { id: original } })).status);

    const second = await owner.agent.post(`/api/v1/coloring/books/${bookId}/pages/${pages[0].id}/clean`).set("Origin", ORIGIN).expect(200);
    expect(second.body.page.assetId).toBe(first.body.page.assetId);
    const all = await owner.agent.post(`/api/v1/coloring/books/${bookId}/quality/auto-clean-all`).set("Origin", ORIGIN).expect(200);
    expect(all.body).toMatchObject({ total: 0, cleanedCount: 0 });
    expect(await prisma.asset.count({ where: { userId: owner.user.id, status: "ready" } })).toBe(1);
  });

  it("keeps a library image in the library when it is replaced", async () => {
    const owner = await author("coloring-library", 100);
    const mine = await ownedAsset(owner.user.id);
    const { bookId, pages } = await createBook(owner.agent);
    await owner.agent.patch(`/api/v1/coloring/books/${bookId}/pages/${pages[0].id}`).set("Origin", ORIGIN).send({ assetId: mine.id }).expect(200);
    await owner.agent.post(`/api/v1/coloring/books/${bookId}/pages/${pages[0].id}/clean`).set("Origin", ORIGIN).expect(200);
    expect(await prisma.assetReference.count({ where: { assetId: mine.id, bookId } })).toBe(0);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("ready");
  });
});

describe("coloring request validation", () => {
  it("rejects unknown fields and out-of-bounds input", async () => {
    const owner = await author("coloring-validate");
    const { bookId, pages } = await createBook(owner.agent);
    const base = `/api/v1/coloring/books/${bookId}`;
    await owner.agent.patch(`${base}/plan`).set("Origin", ORIGIN).send({ title: "ok", status: "published" }).expect(400);
    await owner.agent.patch(`${base}/plan`).set("Origin", ORIGIN).send({ title: "x".repeat(201) }).expect(400);
    await owner.agent.post(`${base}/pages`).set("Origin", ORIGIN).send({ title: "x".repeat(5000), prompt: "A long enough prompt" }).expect(400);
    await owner.agent.post(`${base}/pages`).set("Origin", ORIGIN).send({ title: "ok" }).expect(400);
    await owner.agent.post(`${base}/pages/${pages[0].id}/generate`).set("Origin", ORIGIN).send({ promptOverride: "y".repeat(2001) }).expect(400);
    await owner.agent.post(`${base}/pages/${pages[0].id}/generate`).set("Origin", ORIGIN).send({ promptOverride: 42 }).expect(400);
    await owner.agent.post(`${base}/generate-batch`).set("Origin", ORIGIN).send({ pageIds: Array.from({ length: 1000 }, (_, i) => `p${i}`) }).expect(400);
    await owner.agent.post(`${base}/generate-batch`).set("Origin", ORIGIN).send({ pageIds: [pages[0].id, pages[0].id] }).expect(400);
    await owner.agent.post(`${base}/generate-batch`).set("Origin", ORIGIN).send({ pageIds: "all" }).expect(400);
    expect(await prisma.generationJob.count({ where: { bookId } })).toBe(0);
  });
});
