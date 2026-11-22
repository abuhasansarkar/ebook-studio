import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import sharp from "sharp";
import {
  COLORING_CREDIT_COSTS,
  type ColoringAudience,
  type ColoringDifficulty,
  type ColoringLineThickness,
  type ColoringStyle,
} from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { env } from "../../config/env.js";
import { badRequest, conflict, notFound, serviceUnavailable } from "../../utils/errors.js";
import { reserveInTransaction, settleInTransaction } from "../credits/creditService.js";
import { getOwnedBook } from "../books/bookService.js";
import { sanitizeImage } from "../assets/assetService.js";
import { storage } from "../storage/storage.js";
import { buildColoringPrompt } from "./coloringPromptBuilder.js";
import { coloringQualityService } from "./coloringQualityService.js";

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

  const size = aspect === "square" ? "1024x1024" : "1024x1536";
  const response = await client.images.generate({
    model: env.OPENAI_IMAGE_MODEL || "dall-e-3",
    n: 1,
    size: size as "1024x1024" | "1024x1792",
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

export const coloringGenerationService = {
  /**
   * Generates or regenerates an individual coloring page.
   * Only reserves and settles 8 credits for this single page.
   */
  async generatePage(userId: string, bookId: string, pageId: string, promptOverride?: string) {
    const book = await getOwnedBook(userId, bookId);
    const plan = await prisma.coloringPlan.findUnique({ where: { bookId } });
    if (!plan) throw notFound("Coloring plan");

    const page = await prisma.coloringPage.findFirst({ where: { id: pageId, bookId } });
    if (!page) throw notFound("Coloring page");

    const cost = COLORING_CREDIT_COSTS.perIllustration; // 8 credits
    const reference = `coloring:${pageId}:${Date.now()}`;

    // Step 1: Atomically reserve credits and mark page generating
    await prisma.$transaction(async (tx) => {
      await reserveInTransaction(tx, userId, cost, reference);
      await tx.coloringPage.update({
        where: { id: pageId },
        data: {
          status: "generating",
          error: null,
          ...(promptOverride ? { prompt: promptOverride.trim() } : {}),
        },
      });
    });

    try {
      // Step 2: Compile prompt and call image model
      const compiledPrompt = buildColoringPrompt({
        title: book.title,
        topic: plan.topic,
        artStyle: plan.artStyle as ColoringStyle,
        targetAudience: plan.targetAudience as ColoringAudience,
        difficulty: plan.difficulty as ColoringDifficulty,
        lineThickness: plan.lineThickness as ColoringLineThickness,
        sceneTitle: page.title,
        scenePrompt: promptOverride?.trim() || page.prompt,
        negativePrompt: page.negativePrompt,
      });

      const aspect = plan.trimSize === "8.5x8.5" ? "square" : "portrait";
      const rawImage = await requestOpenAiImage(compiledPrompt, aspect);

      // Step 3: Run quality checks
      const quality = await coloringQualityService.inspectImage(rawImage, plan.trimSize);

      // Step 4: Sanitize raster image and store
      const sanitized = await sanitizeImage(rawImage, "image/png");
      const hash = createHash("sha256").update(sanitized.data).digest("hex");
      const storageKey = `assets/${userId}/${randomUUID()}.webp`;

      await storage.put(storageKey, sanitized.data, "image/webp");

      // Step 5: Persist asset, link to page, and settle credits atomically
      const updated = await prisma.$transaction(async (tx) => {
        const asset = await tx.asset.create({
          data: {
            userId,
            storageKey,
            sha256: hash,
            width: sanitized.width,
            height: sanitized.height,
            bytes: sanitized.data.length,
            status: "ready",
            provenance: `ai:coloring:${plan.artStyle}`,
            alt: page.title,
          },
        });

        await tx.assetReference.upsert({
          where: { assetId_bookId: { assetId: asset.id, bookId } },
          create: { assetId: asset.id, bookId },
          update: {},
        });

        const updatedPage = await tx.coloringPage.update({
          where: { id: pageId },
          data: {
            status: "completed",
            assetId: asset.id,
            qualityChecks: quality as unknown as object,
            error: null,
          },
          include: { asset: true },
        });

        await settleInTransaction(tx, userId, cost, cost, reference);
        return updatedPage;
      });

      return updated;
    } catch (err) {
      // Failure recovery: refund reserved credits and record error
      const message = (err as Error).message || "Coloring page generation failed";
      await prisma.$transaction(async (tx) => {
        try {
          await settleInTransaction(tx, userId, cost, 0, reference);
        } catch {
          // If already settled, do not crash
        }
        await tx.coloringPage.update({
          where: { id: pageId },
          data: { status: "failed", error: message },
        });
      });
      throw err;
    }
  },

  /**
   * Batch generation of all pending pages.
   */
  async generateBatch(userId: string, bookId: string, pageIds?: string[]) {
    await getOwnedBook(userId, bookId);
    const pages = await prisma.coloringPage.findMany({
      where: {
        bookId,
        ...(pageIds?.length ? { id: { in: pageIds } } : { status: { in: ["pending", "failed"] } }),
      },
      orderBy: { pageNumber: "asc" },
    });

    if (!pages.length) {
      throw badRequest("No pending pages to generate in this coloring book");
    }

    const results: { pageId: string; pageNumber: number; success: boolean; error?: string }[] = [];

    for (const page of pages) {
      try {
        await this.generatePage(userId, bookId, page.id);
        results.push({ pageId: page.id, pageNumber: page.pageNumber, success: true });
      } catch (err) {
        results.push({
          pageId: page.id,
          pageNumber: page.pageNumber,
          success: false,
          error: (err as Error).message,
        });
      }
    }

    return {
      total: pages.length,
      completed: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  },
};
