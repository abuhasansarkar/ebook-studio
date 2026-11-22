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
import { notFound, serviceUnavailable } from "../../utils/errors.js";
import { reserveInTransaction, settleInTransaction } from "../credits/creditService.js";
import { getOwnedBook } from "../books/bookService.js";
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

  const response = await client.images.generate({
    model: env.OPENAI_IMAGE_MODEL || "dall-e-3",
    n: 1,
    size: "1024x1792",
    quality: "standard",
    response_format: "b64_json",
    prompt,
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64 || b64.length > 20 * 1024 * 1024) {
    throw new Error("Invalid or missing image returned from provider");
  }

  return Buffer.from(b64, "base64");
}

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
        coverArtworkAsset = await prisma.asset.findUnique({
          where: { id: coverData.artworkId },
        });
      }
    }

    const completedPages = await prisma.coloringPage.findMany({
      where: { bookId, status: "completed", assetId: { not: null } },
      orderBy: { pageNumber: "asc" },
      take: 4,
      include: { asset: true },
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
        storageKey: p.asset?.storageKey,
      })),
    };
  },

  async generateCover(userId: string, bookId: string, input?: ColoringCoverGenerateInput) {
    const book = await getOwnedBook(userId, bookId);
    const plan = await prisma.coloringPlan.findUnique({ where: { bookId } });
    if (!plan) throw notFound("Coloring book plan");

    const cost = COLORING_CREDIT_COSTS.cover; // 10 credits
    const reference = `coloring-cover:${bookId}:${Date.now()}`;

    // Reserve 10 credits atomically
    await prisma.$transaction(async (tx) => {
      await reserveInTransaction(tx, userId, cost, reference);
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
      await prisma.$transaction(async (tx) => {
        try {
          await settleInTransaction(tx, userId, cost, 0, reference);
        } catch {
          // ignore refund settle error
        }
      });
      throw err;
    }
  },
};
