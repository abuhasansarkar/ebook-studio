import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import sharp from "sharp";
import { z } from "zod";
import {
  COLORING_CREDIT_COSTS,
  COLORING_GENERATION_FAILED_MESSAGE,
  COLORING_LIMITS,
  type ColoringAudience,
  type ColoringDifficulty,
  type ColoringGenerationAccepted,
  type ColoringLineThickness,
  type ColoringStyle,
} from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { env } from "../../config/env.js";
import { runtimeFingerprint } from "../../config/runtime.js";
import { AppError, badRequest, conflict, notFound, paymentRequired, serviceUnavailable } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { dispatchPending, persistDispatch } from "../../queues/index.js";
import { reserveInTransaction, settleInTransaction, type Tx } from "../credits/creditService.js";
import { getOwnedBook } from "../books/bookService.js";
import { hasEntitlement } from "../billing/entitlements.js";
import { assertRuntimeAvailable } from "../runtime/readiness.js";
import { sanitizeImage } from "../assets/assetService.js";
import { claimJob, fence, finishJob, GenerationCancelled, heartbeat, LeaseLost, lockBook } from "../generation/jobRuntime.js";
import { storage } from "../storage/storage.js";
import { buildColoringPrompt } from "./coloringPromptBuilder.js";
import { coloringQualityService } from "./coloringQualityService.js";
import { collectReleasedAssets, isUsableAsset, publicAssetSelect, readAssetBytes, releaseAsset } from "./coloringAssets.js";

async function generateMockLineArt(title: string, width = 1024, height = 1536): Promise<Buffer> {
  // Generates a clean, crisp black-and-white line-art SVG rendered into a PNG buffer
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff" />
      <rect x="60" y="60" width="${width - 120}" height="${height - 120}" fill="none" stroke="#000000" stroke-width="4" rx="20" />
      <circle cx="${width / 2}" cy="${height / 2 - 80}" r="220" fill="none" stroke="#000000" stroke-width="6" />
      <path d="M ${width / 2 - 120} ${height / 2 - 120} Q ${width / 2 - 80} ${height / 2 - 180} ${width / 2 - 40} ${height / 2 - 120}" fill="none" stroke="#000000" stroke-width="6" />
      <path d="M ${width / 2 + 40} ${height / 2 - 120} Q ${width / 2 + 80} ${height / 2 - 180} ${width / 2 + 120} ${height / 2 - 120}" fill="none" stroke="#000000" stroke-width="6" />
      <circle cx="${width / 2 - 70}" cy="${height / 2 - 70}" r="24" fill="#000000" />
      <circle cx="${width / 2 + 70}" cy="${height / 2 - 70}" r="24" fill="#000000" />
      <ellipse cx="${width / 2}" cy="${height / 2 - 10}" rx="32" ry="20" fill="none" stroke="#000000" stroke-width="5" />
      <path d="M ${width / 2 - 50} ${height / 2 + 30} Q ${width / 2} ${height / 2 + 80} ${width / 2 + 50} ${height / 2 + 30}" fill="none" stroke="#000000" stroke-width="6" stroke-linecap="round" />
      <!-- Floral decorations around -->
      <circle cx="${width / 2 - 280}" cy="${height / 2 + 250}" r="60" fill="none" stroke="#000000" stroke-width="5" />
      <circle cx="${width / 2 + 280}" cy="${height / 2 + 250}" r="60" fill="none" stroke="#000000" stroke-width="5" />
      <path d="M 120 ${height - 200} Q ${width / 2} ${height - 260} ${width - 120} ${height - 200}" fill="none" stroke="#000000" stroke-width="6" />
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function requestOpenAiImage(prompt: string, aspect: "portrait" | "square" | "landscape"): Promise<Buffer> {
  if (env.AI_MOCK) {
    const isSquare = aspect === "square";
    return generateMockLineArt(prompt.slice(0, 30), 1024, isSquare ? 1024 : 1536);
  }

  if (!env.OPENAI_API_KEY) {
    throw serviceUnavailable("Image generation is not configured. Set OPENAI_API_KEY or AI_MOCK=1.");
  }

  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 120000,
  });

  const model = env.OPENAI_IMAGE_MODEL || "gpt-image-2.6-sunburst";
  const isDallE = model.startsWith("dall-e");
  const size = isDallE
    ? (aspect === "square" ? "1024x1024" : "1024x1792")
    : (aspect === "square" ? "1024x1024" : "1024x1536");

  const params: any = {
    model,
    n: 1,
    size,
    prompt,
  };

  if (isDallE) {
    params.quality = "standard";
    params.response_format = "b64_json";
  } else {
    params.quality = "medium";
    params.output_format = "png";
  }

  const response = await client.images.generate(params);
  const item = response.data?.[0];
  if (item?.b64_json) {
    const b64 = item.b64_json;
    if (b64.length > 20 * 1024 * 1024) {
      throw new Error("Invalid or oversized image returned from provider");
    }
    return Buffer.from(b64, "base64");
  }
  if (item?.url) {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`Failed to fetch image from provider (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("Invalid or missing image returned from provider");
}


/** GenerationJob.type of a single coloring-page illustration. */
export const COLORING_JOB_TYPE = "coloring_page";
const CLEANED_PROVENANCE = "ai:coloring:cleaned";
/** A running job whose lease lapsed this long ago, unreclaimed, is abandoned. */
export const COLORING_STALE_MS = 10 * 60_000;
/** A queued job never picked up within this window is abandoned. */
const COLORING_QUEUED_MAX_MS = 6 * 60 * 60_000;

/** Credit reservations are keyed by job: one job is one attempt, so a redelivery never charges twice. */
const jobReference = (jobId: string) => `job:${jobId}`;

const snapshotSchema = z.object({
  schema: z.literal(1),
  pageId: z.string(),
  prompt: z.string(),
  aspect: z.enum(["portrait", "square"]),
  trimSize: z.string(),
  artStyle: z.string(),
  alt: z.string(),
});
type ColoringSnapshot = z.infer<typeof snapshotSchema>;

function detectMime(raw: Buffer) {
  if (raw.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (raw[0] === 255 && raw[1] === 216 && raw[2] === 255) return "image/jpeg";
  return "image/webp";
}

type AssetLike = { id: string; userId: string; status: string; width: number | null; height: number | null; createdAt: Date };

/** A page as the client may see it: no storage keys, and only images the user owns. */
export function toPublicPage<P extends { assetId: string | null; asset?: AssetLike | null }>(page: P, userId: string) {
  const { asset, ...rest } = page;
  const usable = isUsableAsset(asset, userId);
  return {
    ...rest,
    assetId: usable ? page.assetId : null,
    asset: usable ? { id: asset.id, width: asset.width, height: asset.height, status: asset.status, createdAt: asset.createdAt } : null,
  };
}

export const pageAssetInclude = { asset: { select: { ...publicAssetSelect, userId: true } } } as const;

/** Writes the outcome of an unsuccessful attempt to the page, if this job still owns it. */
async function releasePage(tx: Tx, pageId: string, jobId: string) {
  const page = await tx.coloringPage.findFirst({ where: { id: pageId, generationJobId: jobId } });
  if (!page) return;
  // A page that already had an illustration keeps it (and stays exportable); the notice explains the failed retry.
  await tx.coloringPage.update({
    where: { id: pageId },
    data: { status: page.assetId ? "completed" : "failed", error: COLORING_GENERATION_FAILED_MESSAGE, generationJobId: null },
  });
}

export const coloringGenerationService = {
  /**
   * Queues pages for background illustration.
   *
   * Pages are claimed atomically (a page already generating is never queued
   * twice), credits are reserved per page at enqueue under the job's stable
   * reference, and the worker settles or releases them.
   */
  async enqueuePages(
    userId: string,
    bookId: string,
    opts: { pageIds?: string[]; promptOverride?: string } = {},
  ): Promise<ColoringGenerationAccepted> {
    await getOwnedBook(userId, bookId);
    await assertRuntimeAvailable();
    if (!env.AI_MOCK && !env.OPENAI_API_KEY) throw serviceUnavailable("Image generation is not configured.");
    const paid = await hasEntitlement(userId, "priorityJobs");
    const cost = COLORING_CREDIT_COSTS.perIllustration;
    const override = opts.promptOverride?.trim() || undefined;

    const result = await prisma.$transaction(async (tx) => {
      await lockBook(tx, bookId, userId);
      const book = await tx.book.findUniqueOrThrow({ where: { id: bookId } });
      const plan = await tx.coloringPlan.findUnique({ where: { bookId } });
      if (!plan) throw notFound("Coloring plan");

      const candidates = await tx.coloringPage.findMany({
        where: { bookId, ...(opts.pageIds ? { id: { in: opts.pageIds } } : { status: { in: ["pending", "failed"] } }) },
        orderBy: { pageNumber: "asc" },
      });
      if (opts.pageIds && candidates.length !== opts.pageIds.length) throw notFound("Coloring page");
      const skipped = candidates.filter((p) => p.status === "generating").map((p) => p.id);
      const eligible = candidates.filter((p) => p.status !== "generating");
      if (!eligible.length) {
        if (skipped.length) {
          throw conflict(skipped.length === 1 ? "This page is already generating." : "These pages are already generating.", { pageIds: skipped });
        }
        throw badRequest("No pending pages to generate in this coloring book");
      }

      const active = await tx.generationJob.count({ where: { userId, type: COLORING_JOB_TYPE, status: { in: ["queued", "running"] } } });
      if (active + eligible.length > COLORING_LIMITS.maxActivePageJobs) {
        throw new AppError(
          429,
          "RATE_LIMITED",
          `You can have up to ${COLORING_LIMITS.maxActivePageJobs} coloring pages generating at once. Wait for the current pages to finish.`,
          { active, requested: eligible.length, limit: COLORING_LIMITS.maxActivePageJobs },
        );
      }

      const required = eligible.length * cost;
      const wallet = await tx.creditWallet.findUnique({ where: { userId } });
      const balance = wallet?.balance ?? 0;
      if (balance < required) {
        throw paymentRequired(`Generating ${eligible.length} page${eligible.length === 1 ? "" : "s"} needs ${required} credits but you have ${balance}.`, { required, balance });
      }

      const aspect = plan.trimSize === "8.5x8.5" ? "square" : "portrait";
      let queued = 0;
      for (const page of eligible) {
        const claimed = await tx.coloringPage.updateMany({
          where: { id: page.id, bookId, status: { not: "generating" } },
          data: { status: "generating", error: null, ...(override ? { prompt: override } : {}) },
        });
        if (!claimed.count) {
          skipped.push(page.id);
          continue;
        }
        const snapshot: ColoringSnapshot = {
          schema: 1,
          pageId: page.id,
          prompt: buildColoringPrompt({
            title: book.title,
            topic: plan.topic,
            artStyle: plan.artStyle as ColoringStyle,
            targetAudience: plan.targetAudience as ColoringAudience,
            difficulty: plan.difficulty as ColoringDifficulty,
            lineThickness: plan.lineThickness as ColoringLineThickness,
            sceneTitle: page.title,
            scenePrompt: override ?? page.prompt,
            negativePrompt: page.negativePrompt,
          }),
          aspect,
          trimSize: plan.trimSize,
          artStyle: plan.artStyle,
          alt: page.title,
        };
        const job = await tx.generationJob.create({
          data: { userId, bookId, type: COLORING_JOB_TYPE, total: 1, creditsReserved: cost, model: env.OPENAI_IMAGE_MODEL, inputSnapshot: snapshot },
        });
        await reserveInTransaction(tx, userId, cost, jobReference(job.id));
        await tx.coloringPage.update({ where: { id: page.id }, data: { generationJobId: job.id } });
        await persistDispatch(tx, "coloring", job.id, paid);
        queued++;
      }

      const pages = await tx.coloringPage.findMany({
        where: { id: { in: candidates.map((p) => p.id) } },
        orderBy: { pageNumber: "asc" },
        select: { id: true, pageNumber: true, status: true },
      });
      return { queued, skipped, creditsReserved: queued * cost, pages: pages as ColoringGenerationAccepted["pages"] };
    }, { timeout: 30_000 });

    await dispatchPending().catch(() => undefined);
    return result;
  },

  /** Queues one page (optionally with a new prompt). */
  generatePage(userId: string, bookId: string, pageId: string, promptOverride?: string) {
    return this.enqueuePages(userId, bookId, { pageIds: [pageId], promptOverride });
  },

  /** Queues the given pages, or every pending and failed page. */
  generateBatch(userId: string, bookId: string, pageIds?: string[]) {
    return this.enqueuePages(userId, bookId, { pageIds });
  },

  /** Worker processor for one `coloring_page` job. Idempotent under redelivery. */
  async process(id: string) {
    const token = await claimJob(id);
    if (!token) return;
    const stop = heartbeat(id, token);
    let pageId: string | undefined;
    let pendingAssetId: string | undefined;
    try {
      const job = await prisma.$transaction((tx) => fence(tx, id, token));
      if (job.type !== COLORING_JOB_TYPE) throw new Error("Wrong coloring job type");
      const snapshot = snapshotSchema.parse(job.inputSnapshot);
      pageId = snapshot.pageId;

      const raw = await requestOpenAiImage(snapshot.prompt, snapshot.aspect);
      const quality = await coloringQualityService.inspectImage(raw, snapshot.trimSize);
      const sanitized = await sanitizeImage(raw, detectMime(raw));
      const sha256 = createHash("sha256").update(sanitized.data).digest("hex");

      // The row exists before the object write, so an interrupted write is swept by asset cleanup.
      const asset = await prisma.$transaction(async (tx) => {
        await fence(tx, id, token);
        return tx.asset.create({
          data: {
            userId: job.userId,
            storageKey: `assets/${job.userId}/${randomUUID()}.webp`,
            sha256,
            width: sanitized.width,
            height: sanitized.height,
            bytes: sanitized.data.length,
            status: "processing",
            provenance: `ai:coloring:${snapshot.artStyle}`,
            alt: snapshot.alt,
          },
        });
      });
      pendingAssetId = asset.id;
      await storage.put(asset.storageKey, sanitized.data, "image/webp");

      const released = await prisma.$transaction(async (tx) => {
        await fence(tx, id, token);
        const page = await tx.coloringPage.findFirst({ where: { id: snapshot.pageId, bookId: job.bookId } });
        // The page was deleted or handed to a newer job: this attempt is void and refunded.
        if (!page || page.generationJobId !== id) throw new GenerationCancelled();
        await tx.asset.update({ where: { id: asset.id }, data: { status: "ready" } });
        await tx.assetReference.upsert({
          where: { assetId_bookId: { assetId: asset.id, bookId: job.bookId } },
          create: { assetId: asset.id, bookId: job.bookId },
          update: {},
        });
        await tx.coloringPage.update({
          where: { id: page.id },
          data: { status: "completed", assetId: asset.id, qualityChecks: quality as unknown as object, error: null, generationJobId: null },
        });
        const previous = page.assetId && page.assetId !== asset.id ? await releaseAsset(tx, job.userId, job.bookId, page.assetId) : null;
        await tx.generationJob.update({ where: { id }, data: { progress: 1, creditsCharged: job.creditsReserved } });
        await finishJob(tx, id, "completed");
        return previous;
      }, { timeout: 60_000 });
      pendingAssetId = undefined;
      await collectReleasedAssets([released]);
    } catch (err) {
      if (err instanceof LeaseLost) return;
      const cancelled = err instanceof GenerationCancelled;
      // The provider's message can carry request ids or account details: log it, never store it.
      if (!cancelled) logger.error({ err, jobId: id, pageId }, "Coloring page generation failed");
      try {
        await prisma.$transaction(async (tx) => {
          const job = await fence(tx, id, token, true);
          await finishJob(tx, id, cancelled || job.cancelRequested ? "cancelled" : "failed", cancelled ? undefined : COLORING_GENERATION_FAILED_MESSAGE);
          if (pageId) await releasePage(tx, pageId, id);
          if (pendingAssetId) await tx.asset.updateMany({ where: { id: pendingAssetId, status: "processing" }, data: { status: "deleting" } });
        });
        await collectReleasedAssets([pendingAssetId]);
      } catch (error) {
        if (!(error instanceof LeaseLost)) throw error;
      }
    } finally {
      stop();
    }
  },

  /**
   * Fails coloring work that can no longer finish and returns its credits.
   *
   * - a job whose lease lapsed long ago and was never reclaimed (worker died);
   * - a queued job no compatible worker will take (dispatched by a previous
   *   release) or that has waited far too long;
   * - a page still marked generating whose job already ended (e.g. cancelled
   *   by an operator) or that predates background jobs.
   */
  async recoverStale(opts: { bookId?: string; now?: Date } = {}) {
    const now = opts.now ?? new Date();
    const staleBefore = new Date(now.getTime() - COLORING_STALE_MS);
    let recovered = 0;

    const jobs = await prisma.generationJob.findMany({
      where: { type: COLORING_JOB_TYPE, status: { in: ["queued", "running"] }, updatedAt: { lt: staleBefore }, ...(opts.bookId ? { bookId: opts.bookId } : {}) },
      take: 100,
    });
    for (const candidate of jobs) {
      let abandoned = false;
      if (candidate.status === "running") {
        abandoned = !candidate.leaseExpiresAt || candidate.leaseExpiresAt < staleBefore;
      } else {
        const dispatch = await prisma.queueDispatch.findFirst({ where: { jobId: candidate.id, queue: "coloring" } });
        abandoned = !dispatch || dispatch.fingerprint !== runtimeFingerprint || candidate.createdAt.getTime() < now.getTime() - COLORING_QUEUED_MAX_MS;
      }
      if (!abandoned) continue;
      const done = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM generation_jobs WHERE id = ${candidate.id} FOR UPDATE`;
        if (!rows.length) return false;
        const job = await tx.generationJob.findUniqueOrThrow({ where: { id: candidate.id } });
        // Re-check under the lock: a worker may have claimed or renewed it meanwhile.
        if (!["queued", "running"].includes(job.status) || job.updatedAt >= staleBefore) return false;
        if (job.status === "running" && job.leaseExpiresAt && job.leaseExpiresAt >= staleBefore) return false;
        await finishJob(tx, job.id, "failed", COLORING_GENERATION_FAILED_MESSAGE);
        const snapshot = snapshotSchema.safeParse(job.inputSnapshot);
        if (snapshot.success) await releasePage(tx, snapshot.data.pageId, job.id);
        return true;
      });
      if (done) {
        recovered++;
        logger.warn({ jobId: candidate.id }, "Abandoned coloring page job failed and its credits released");
      }
    }

    const stuck = await prisma.coloringPage.findMany({
      where: { status: "generating", ...(opts.bookId ? { bookId: opts.bookId } : {}) },
      include: { book: { select: { userId: true } } },
      take: 200,
    });
    for (const page of stuck) {
      if (page.generationJobId) {
        const job = await prisma.generationJob.findUnique({ where: { id: page.generationJobId }, select: { status: true } });
        if (job && ["queued", "running"].includes(job.status)) continue;
        await prisma.$transaction((tx) => releasePage(tx, page.id, page.generationJobId!));
        recovered++;
        continue;
      }
      // Pages left generating by the pre-queue code path: fail them and release their legacy reservations.
      if (page.updatedAt >= staleBefore) continue;
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.coloringPage.updateMany({
          where: { id: page.id, status: "generating", generationJobId: null, updatedAt: { lt: staleBefore } },
          data: { status: page.assetId ? "completed" : "failed", error: COLORING_GENERATION_FAILED_MESSAGE },
        });
        if (!claimed.count) return;
        const reservations = await tx.creditTransaction.findMany({
          where: { userId: page.book.userId, type: "reserve", reference: { startsWith: `coloring:${page.id}:` } },
        });
        for (const r of reservations) {
          if (r.reference) await settleInTransaction(tx, page.book.userId, -r.amount, 0, r.reference);
        }
      });
      recovered++;
    }
    return { recovered };
  },

  /**
   * 1-Click Auto-Clean: binarizes line art to a pure white background and deep black outlines.
   *
   * Free (no AI call) and bounded: an image that is already the cleaned output
   * is returned unchanged, so each generated illustration is cleaned at most
   * once, and the replaced image is released.
   */
  async autoCleanPage(userId: string, bookId: string, pageId: string) {
    await getOwnedBook(userId, bookId);
    const plan = await prisma.coloringPlan.findUnique({ where: { bookId } });
    if (!plan) throw notFound("Coloring plan");

    const page = await prisma.coloringPage.findFirst({ where: { id: pageId, bookId }, include: { asset: true } });
    if (!page) throw notFound("Coloring page");
    if (page.status === "generating") throw conflict("This page is still generating. Clean it once the illustration is ready.");
    if (!page.assetId || !isUsableAsset(page.asset, userId)) throw notFound("Coloring page with illustration asset");
    const source = page.asset;
    if (source.provenance === CLEANED_PROVENANCE) {
      return toPublicPage(await prisma.coloringPage.findUniqueOrThrow({ where: { id: pageId }, include: pageAssetInclude }), userId);
    }

    const cleanedBuffer = await coloringQualityService.autoCleanLines(await readAssetBytes(source.storageKey));
    const quality = await coloringQualityService.inspectImage(cleanedBuffer, plan.trimSize);
    const sanitized = await sanitizeImage(cleanedBuffer, "image/png");
    const asset = await prisma.asset.create({
      data: {
        userId,
        storageKey: `assets/${userId}/${randomUUID()}.webp`,
        sha256: createHash("sha256").update(sanitized.data).digest("hex"),
        width: sanitized.width,
        height: sanitized.height,
        bytes: sanitized.data.length,
        status: "processing",
        provenance: CLEANED_PROVENANCE,
        alt: `${page.title} (Cleaned Line Art)`,
      },
    });
    await storage.put(asset.storageKey, sanitized.data, "image/webp");

    const outcome = await prisma.$transaction(async (tx) => {
      // Only replace the image that was cleaned: a regeneration that started meanwhile wins.
      const swapped = await tx.coloringPage.updateMany({
        where: { id: pageId, bookId, assetId: source.id, status: { not: "generating" } },
        data: { assetId: asset.id, qualityChecks: quality as unknown as object, error: null, status: "completed" },
      });
      if (!swapped.count) {
        await tx.asset.update({ where: { id: asset.id }, data: { status: "deleting" } });
        return { swapped: false as const, released: asset.id };
      }
      await tx.asset.update({ where: { id: asset.id }, data: { status: "ready" } });
      await tx.assetReference.upsert({
        where: { assetId_bookId: { assetId: asset.id, bookId } },
        create: { assetId: asset.id, bookId },
        update: {},
      });
      return { swapped: true as const, released: await releaseAsset(tx, userId, bookId, source.id) };
    });
    await collectReleasedAssets([outcome.released]);
    if (!outcome.swapped) throw conflict("This page changed while it was being cleaned. Refresh and try again.");
    return toPublicPage(await prisma.coloringPage.findUniqueOrThrow({ where: { id: pageId }, include: pageAssetInclude }), userId);
  },

  /** Auto-cleans every finished page whose illustration has not been cleaned yet. */
  async autoCleanAll(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    const pages = await prisma.coloringPage.findMany({
      where: { bookId, status: "completed", asset: { userId, status: "ready", provenance: { not: CLEANED_PROVENANCE } } },
      orderBy: { pageNumber: "asc" },
      take: COLORING_LIMITS.maxPages,
    });

    let cleanedCount = 0;
    for (const page of pages) {
      try {
        await this.autoCleanPage(userId, bookId, page.id);
        cleanedCount++;
      } catch (err) {
        logger.warn({ err, pageId: page.id }, "Coloring page auto-clean skipped");
      }
    }
    return { total: pages.length, cleanedCount };
  },
};
