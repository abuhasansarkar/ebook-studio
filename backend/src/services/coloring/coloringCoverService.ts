import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import sharp from "sharp";
import {
  COLORING_CREDIT_COSTS,
  COLORING_STYLE_CATALOG,
  defaultCover,
  type ColoringCoverGenerateInput,
  type ColoringStyle,
} from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { env } from "../../config/env.js";
import { conflict, notFound, serviceUnavailable } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { reserveInTransaction, settleInTransaction } from "../credits/creditService.js";
import { getOwnedBook } from "../books/bookService.js";
import { lockBook } from "../generation/jobRuntime.js";
import { publicAssetSelect } from "./coloringAssets.js";
import { sanitizeImage } from "../assets/assetService.js";
import { storage } from "../storage/storage.js";

export interface SpineCalculation {
  interiorPages: number;
  totalPhysicalPages: number;
  spineThicknessInches: number;
  spineThicknessMm: number;
  meetsKdpSpineTextThreshold: boolean; // Amazon requires >= 79 pages for spine text
  singleSided: boolean;
}

export function calculateSpine(pageCount: number, singleSided = true): SpineCalculation {
  // Single-sided printing has 1 blank back page per illustration + 2 pages front matter
  const totalPhysicalPages = singleSided ? pageCount * 2 + 2 : pageCount + 2;
  // KDP white paper formula: page count * 0.002252 inches
  const spineThicknessInches = Number((totalPhysicalPages * 0.002252).toFixed(4));
  const spineThicknessMm = Number((spineThicknessInches * 25.4).toFixed(2));
  const meetsKdpSpineTextThreshold = totalPhysicalPages >= 79;

  return {
    interiorPages: pageCount,
    totalPhysicalPages,
    spineThicknessInches,
    spineThicknessMm,
    meetsKdpSpineTextThreshold,
    singleSided,
  };
}

async function generateMockCoverArt(title: string, style: string, width = 1600, height = 2560): Promise<Buffer> {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#312e81" />
          <stop offset="40%" stop-color="#4f46e5" />
          <stop offset="80%" stop-color="#ec4899" />
          <stop offset="100%" stop-color="#f59e0b" />
        </linearGradient>
        <radialGradient id="sunGlow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9" />
          <stop offset="60%" stop-color="#fef08a" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#f59e0b" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#skyGrad)" />
      <!-- Radiant background glow -->
      <circle cx="${width / 2}" cy="${height * 0.42}" r="500" fill="url(#sunGlow)" />
      <!-- Cute centerpiece character silhouette / artwork -->
      <circle cx="${width / 2}" cy="${height * 0.48}" r="320" fill="#ffffff" stroke="#4f46e5" stroke-width="16" />
      <circle cx="${width / 2 - 90}" cy="${height * 0.44}" r="35" fill="#1e1b4b" />
      <circle cx="${width / 2 + 90}" cy="${height * 0.44}" r="35" fill="#1e1b4b" />
      <circle cx="${width / 2 - 105}" cy="${height * 0.425}" r="12" fill="#ffffff" />
      <circle cx="${width / 2 + 75}" cy="${height * 0.425}" r="12" fill="#ffffff" />
      <ellipse cx="${width / 2 - 140}" cy="${height * 0.48}" rx="25" ry="15" fill="#f472b6" opacity="0.6" />
      <ellipse cx="${width / 2 + 140}" cy="${height * 0.48}" rx="25" ry="15" fill="#f472b6" opacity="0.6" />
      <path d="M ${width / 2 - 40} ${height * 0.51} Q ${width / 2} ${height * 0.55} ${width / 2 + 40} ${height * 0.51}" fill="none" stroke="#1e1b4b" stroke-width="14" stroke-linecap="round" />
      <!-- Stylistic sparkles -->
      <polygon points="${width * 0.2},${height * 0.25} ${width * 0.22},${height * 0.28} ${width * 0.26},${height * 0.29} ${width * 0.23},${height * 0.32} ${width * 0.24},${height * 0.36} ${width * 0.2},${height * 0.33} ${width * 0.16},${height * 0.36} ${width * 0.17},${height * 0.32} ${width * 0.14},${height * 0.29} ${width * 0.18},${height * 0.28}" fill="#ffffff" />
      <polygon points="${width * 0.8},${height * 0.28} ${width * 0.815},${height * 0.3} ${width * 0.845},${height * 0.31} ${width * 0.82},${height * 0.33} ${width * 0.83},${height * 0.36} ${width * 0.8},${height * 0.34} ${width * 0.77},${height * 0.36} ${width * 0.78},${height * 0.33} ${width * 0.755},${height * 0.31} ${width * 0.785},${height * 0.3}" fill="#ffffff" />
      <!-- Lower decorative ground waves -->
      <path d="M 0 ${height * 0.82} Q ${width * 0.3} ${height * 0.76} ${width * 0.6} ${height * 0.84} T ${width} ${height * 0.82} L ${width} ${height} L 0 ${height} Z" fill="#10b981" />
      <path d="M 0 ${height * 0.88} Q ${width * 0.4} ${height * 0.84} ${width * 0.75} ${height * 0.9} T ${width} ${height * 0.88} L ${width} ${height} L 0 ${height} Z" fill="#059669" />
    </svg>
  `;
  return sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
}

async function requestOpenAiCoverImage(prompt: string): Promise<Buffer> {
  if (env.AI_MOCK) {
    return generateMockCoverArt(prompt.slice(0, 30), "cover", 1600, 2560);
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
  const size = isDallE ? "1024x1792" : "1024x1536";

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
    if (!res.ok) throw new Error(`Failed to fetch cover image from provider (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("Invalid or missing image returned from provider");
}

/** A cover reservation older than this, never settled, belongs to a request that died. */
const COVER_STALE_MS = 10 * 60_000;

export const coloringCoverService = {
  async getCoverDetails(userId: string, bookId: string) {
    const book = await getOwnedBook(userId, bookId);
    const plan = await prisma.coloringPlan.findUnique({ where: { bookId } });
    if (!plan) throw notFound("Coloring book plan");

    const cover = await prisma.coverDesign.findFirst({
      where: { bookId },
      orderBy: { version: "desc" },
    });

    let coverArtworkAsset = null;
    if (cover) {
      const coverData = cover.data as Record<string, unknown>;
      if (coverData?.artworkId && typeof coverData.artworkId === "string") {
        coverArtworkAsset = await prisma.asset.findFirst({
          where: { id: coverData.artworkId, userId, status: "ready" },
          select: publicAssetSelect,
        });
      }
    }

    const completedPages = await prisma.coloringPage.findMany({
      where: { bookId, status: "completed", asset: { userId, status: "ready" } },
      orderBy: { pageNumber: "asc" },
      take: 4,
      select: { pageNumber: true, title: true, assetId: true },
    });

    const spine = calculateSpine(plan.pageCount, plan.singleSided);

    return {
      book,
      plan,
      cover,
      coverArtworkAsset,
      spine,
      sampleThumbnails: completedPages.map((p) => ({
        pageNumber: p.pageNumber,
        title: p.title,
        assetId: p.assetId,
      })),
    };
  },

  async generateCover(userId: string, bookId: string, input?: ColoringCoverGenerateInput) {
    const book = await getOwnedBook(userId, bookId);
    const plan = await prisma.coloringPlan.findUnique({ where: { bookId } });
    if (!plan) throw notFound("Coloring book plan");

    const cost = COLORING_CREDIT_COSTS.cover; // 10 credits
    const prefix = `coloring-cover:${bookId}:`;

    // Reserve under a stable, sequential reference (`coloring-cover:<book>:<attempt>`), with the
    // book locked so concurrent requests serialize. An attempt still in flight refuses a second one,
    // so a double click never charges twice and a stale reservation is identifiable by the sweeper.
    const reference = await prisma.$transaction(async (tx) => {
      await lockBook(tx, bookId, userId);
      const reservations = await tx.creditTransaction.findMany({
        where: { userId, type: "reserve", reference: { startsWith: prefix } },
        select: { reference: true, amount: true, createdAt: true },
      });
      const settledKeys = new Set((await tx.creditTransaction.findMany({
        where: { idempotencyKey: { in: reservations.map((r) => `settle:${r.reference}`) } },
        select: { idempotencyKey: true },
      })).map((r) => r.idempotencyKey));
      for (const r of reservations) {
        if (!r.reference || settledKeys.has(`settle:${r.reference}`)) continue;
        // A request that died mid-generation: release its hold instead of blocking the author.
        if (r.createdAt.getTime() < Date.now() - COVER_STALE_MS) await settleInTransaction(tx, userId, -r.amount, 0, r.reference);
        else throw conflict("A cover is already being generated for this book.");
      }
      const next = `${prefix}${reservations.length + 1}`;
      await reserveInTransaction(tx, userId, cost, next);
      return next;
    });

    try {
      const styleMeta = COLORING_STYLE_CATALOG[plan.artStyle as ColoringStyle] || COLORING_STYLE_CATALOG.cute_animals;
      const title = input?.titleOverride?.trim() || book.title;
      const subtitle = input?.subtitleOverride !== undefined ? input.subtitleOverride.trim() : (book.subtitle || "");
      const author = input?.authorOverride?.trim() || "";

      const compiledPrompt = input?.promptOverride?.trim()
        ? `Commercial children's coloring book cover art: ${input.promptOverride.trim()}. Art style: ${styleMeta.label}. Vibrant colors, highly detailed, joyful, appealing commercial cover art, 300 DPI, no text, clean composition.`
        : `Vibrant, charming commercial coloring book cover illustration for "${title}". Topic: ${plan.topic}. Art Style: ${styleMeta.label} (${styleMeta.description}). Audience: ${plan.targetAudience}. Eye-catching joyful colors, rich cheerful vector style, premium children's book publishing cover, high resolution, 300 DPI, no typography, no letters, no text.`;

      const rawBuffer = await requestOpenAiCoverImage(compiledPrompt);
      const sanitized = await sanitizeImage(rawBuffer, "image/jpeg");
      const hash = createHash("sha256").update(sanitized.data).digest("hex");
      const storageKey = `assets/${userId}/${randomUUID()}.webp`;

      await storage.put(storageKey, sanitized.data, "image/webp");

      const result = await prisma.$transaction(async (tx) => {
        const asset = await tx.asset.create({
          data: {
            userId,
            storageKey,
            sha256: hash,
            width: sanitized.width,
            height: sanitized.height,
            bytes: sanitized.data.length,
            status: "ready",
            provenance: `ai:coloring_cover:${plan.artStyle}`,
            alt: `${title} Cover Artwork`,
          },
        });

        await tx.assetReference.upsert({
          where: { assetId_bookId: { assetId: asset.id, bookId } },
          create: { assetId: asset.id, bookId },
          update: {},
        });

        const latestCover = await tx.coverDesign.findFirst({
          where: { bookId },
          orderBy: { version: "desc" },
        });
        const nextVersion = (latestCover?.version ?? 0) + 1;

        const coverData = defaultCover(title, subtitle, author, book.language);
        coverData.artworkId = asset.id;

        const createdCover = await tx.coverDesign.create({
          data: {
            bookId,
            version: nextVersion,
            data: coverData,
          },
        });

        if (input?.titleOverride?.trim() || input?.subtitleOverride !== undefined) {
          await tx.book.update({
            where: { id: bookId },
            data: {
              ...(input.titleOverride?.trim() ? { title: input.titleOverride.trim() } : {}),
              ...(input.subtitleOverride !== undefined ? { subtitle: input.subtitleOverride.trim() } : {}),
            },
          });
        }

        await settleInTransaction(tx, userId, cost, cost, reference);

        return {
          cover: createdCover,
          asset,
        };
      });

      return result;
    } catch (err) {
      try {
        await prisma.$transaction((tx) => settleInTransaction(tx, userId, cost, 0, reference));
      } catch (refundError) {
        // The reservation sweeper releases it later; never mask the original failure.
        logger.error({ err: refundError, reference }, "Coloring cover refund deferred");
      }
      if (err instanceof Error && err.name !== "AppError") {
        logger.error({ err, bookId }, "Coloring cover generation failed");
        throw serviceUnavailable("Cover generation failed. Reserved credits were returned. Please try again.");
      }
      throw err;
    }
  },
};
