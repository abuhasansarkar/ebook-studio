import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  coloringBookBriefSchema,
  COLORING_STYLE_CATALOG,
  COLORING_CREDIT_COSTS,
  type ColoringBookBrief,
  type ColoringPageUpdateInput,
  type ColoringStyle,
} from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { env } from "../../config/env.js";
import { badRequest, notFound, paymentRequired } from "../../utils/errors.js";
import { openaiProvider, type AiUsage } from "../ai/openaiClient.js";
import { getOwnedBook } from "../books/bookService.js";
import { creditService } from "../credits/creditService.js";

const aiPlanSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  pages: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      prompt: z.string(),
    }),
  ),
});

const mockUsage: AiUsage = { model: "mock-coloring-planner", inputTokens: 0, outputTokens: 0 };

function enrichPages(
  basePages: { title: string; description: string; prompt: string }[],
  brief: ColoringBookBrief,
): { title: string; description: string; prompt: string }[] {
  const styleMeta = COLORING_STYLE_CATALOG[brief.artStyle] || COLORING_STYLE_CATALOG.cute_animals;
  const topicClean = brief.topic.trim().replace(/\.$/, "");
  const pages = [...basePages];

  const atmospheres = [
    "in a sunny flower garden full of blooming daisies",
    "beside a wooden countryside fence with grassy hills",
    "under a shady leafy tree with dappled sunlight",
    "splashing near a crystal-clear peaceful forest stream",
    "exploring a gentle rolling meadow with fluttering butterflies",
    "on a cozy picnic blanket with basket and sweet treats",
    "discovering a hidden magical glade with mushroom houses",
    "enjoying a warm morning sunrise with soft clouds",
    "playing cheerfully with a pile of autumn leaves",
    "resting beneath a starry night sky with crescent moon",
    "at a colorful garden festival with decorative lanterns",
    "wandering through an enchanted path surrounded by nature",
  ];

  const actions = [
    "joyfully exploring and having fun",
    "peacefully relaxing and enjoying the day",
    "playing a cheerful game with playful friends",
    "curiously discovering a new surprise",
    "standing proudly with a warm cheerful smile",
    "celebrating a happy moment surrounded by flowers",
    "adventuring through the outdoors with curiosity",
    "taking a sweet rest after an exciting adventure",
  ];

  let i = pages.length;
  while (pages.length < brief.pageCount) {
    i++;
    const atm = atmospheres[(i - 1) % atmospheres.length];
    const act = actions[(i - 1) % actions.length];
    const title = `${capitalize(topicClean)} - Scene ${i}`;
    const description = `${capitalize(topicClean)} ${act} ${atm}.`;
    const prompt = `A delightful ${styleMeta.label} line-art coloring page of ${topicClean} ${act} ${atm}. Bold clean outlines, pure white background, no shading, no greyscale, high contrast black ink, perfect for coloring.`;

    pages.push({ title, description, prompt });
  }

  return pages.slice(0, brief.pageCount);
}

function mockGeneratePages(brief: ColoringBookBrief) {
  const styleMeta = COLORING_STYLE_CATALOG[brief.artStyle] || COLORING_STYLE_CATALOG.cute_animals;
  const topicClean = brief.topic.trim().replace(/\.$/, "");
  const title = brief.title?.trim() || `${capitalize(topicClean)} Coloring Book`;
  const subtitle =
    brief.subtitle?.trim() ||
    `${brief.pageCount} ${styleMeta.label} Coloring Pages for ${capitalize(brief.targetAudience)}`;

  return {
    title,
    subtitle,
    pages: enrichPages([], brief),
  };
}

function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export const coloringPlanService = {
  async createPlan(userId: string, input: ColoringBookBrief) {
    const brief = coloringBookBriefSchema.parse(input);

    // Charge credits upfront (throws 402 paymentRequired if balance is insufficient)
    const spendKey = `coloring-plan:${userId}:${randomUUID()}`;
    await creditService.spend(
      userId,
      COLORING_CREDIT_COSTS.plan,
      spendKey,
      `Coloring book plan: ${brief.topic.slice(0, 50)}`,
    );

    let planData: { title: string; subtitle: string; pages: { title: string; description: string; prompt: string }[] };

    if (env.AI_MOCK || !env.OPENAI_API_KEY) {
      planData = mockGeneratePages(brief);
    } else {
      const styleMeta = COLORING_STYLE_CATALOG[brief.artStyle] || COLORING_STYLE_CATALOG.cute_animals;
      const sampleTarget = Math.min(brief.pageCount, 12);
      const prompt = {
        system: [
          `You are a master coloring book designer and art director specializing in commercial, bestselling Amazon KDP coloring books.`,
          `Create a cohesive, engaging coloring book concept based on the user's idea.`,
          `Generate ${sampleTarget} distinct, imaginative, and age-appropriate scene concepts.`,
          `Every page must have:`,
          `1. 'title': A short, catchy title (e.g. 'Playful Piglet in Mud').`,
          `2. 'description': A 1-2 sentence description of the action, composition, and background context.`,
          `3. 'prompt': A detailed line-art image generation prompt describing the character, pose, and background props without color words.`,
          `Style: ${styleMeta.label} (${styleMeta.description}).`,
          `Audience: ${brief.targetAudience}, Complexity: ${brief.difficulty}, Line weight: ${brief.lineThickness}.`,
        ].join("\n"),
        user: `Idea: ${brief.topic}\nSuggested Title: ${brief.title || "Auto"}\nTarget Count: ${sampleTarget}\nLanguage: ${brief.language}`,
      };

      try {
        // Enforce 18s timeout to avoid upstream proxy socket hangup (ECONNRESET)
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Coloring plan AI timeout")), 18000),
        );

        const result = await Promise.race([
          openaiProvider.json({
            ...prompt,
            schema: aiPlanSchema,
            name: "coloring_book_plan",
            maxOutputTokens: 2500,
          }),
          timeoutPromise,
        ]);

        const aiPages = result.data.pages || [];
        const baseTitle = brief.title?.trim() || result.data.title;
        const baseSubtitle = brief.subtitle?.trim() || result.data.subtitle;

        planData = {
          title: baseTitle,
          subtitle: baseSubtitle,
          pages: enrichPages(aiPages, brief),
        };
      } catch {
        planData = mockGeneratePages(brief);
      }
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const book = await tx.book.create({
          data: {
            userId,
            title: planData.title,
            subtitle: planData.subtitle,
            language: brief.language,
            bookType: "coloring_book",
            status: "outline_ready",
            projectId: brief.projectId || null,
          },
        });

        const coloringPlan = await tx.coloringPlan.create({
          data: {
            bookId: book.id,
            topic: brief.topic,
            artStyle: brief.artStyle,
            targetAudience: brief.targetAudience,
            difficulty: brief.difficulty,
            lineThickness: brief.lineThickness,
            trimSize: brief.trimSize,
            bleed: brief.bleed,
            singleSided: brief.singleSided,
            pageCount: brief.pageCount,
            density: brief.density,
          },
        });

        await tx.coloringPage.createMany({
          data: planData.pages.map((p, idx) => ({
            bookId: book.id,
            pageNumber: idx + 1,
            title: p.title,
            description: p.description,
            prompt: p.prompt,
            status: "pending",
          })),
        });

        const createdPages = await tx.coloringPage.findMany({
          where: { bookId: book.id },
          orderBy: { pageNumber: "asc" },
        });

        return {
          book,
          plan: coloringPlan,
          pages: createdPages,
        };
      });
    } catch (err) {
      // Refund credits if book transaction failed
      await creditService.grant(
        userId,
        COLORING_CREDIT_COSTS.plan,
        `refund:${spendKey}`,
        "Refund: failed to create coloring book plan",
      );
      throw err;
    }
  },

  async getPlan(userId: string, bookId: string) {
    const book = await getOwnedBook(userId, bookId);
    const plan = await prisma.coloringPlan.findUnique({ where: { bookId } });
    if (!plan) throw notFound("Coloring book plan");

    const pages = await prisma.coloringPage.findMany({
      where: { bookId },
      orderBy: { pageNumber: "asc" },
      include: {
        asset: {
          select: {
            id: true,
            storageKey: true,
            width: true,
            height: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    const cover = await prisma.coverDesign.findFirst({
      where: { bookId },
      orderBy: { version: "desc" },
    });

    const stats = {
      total: pages.length,
      pending: pages.filter((p) => p.status === "pending").length,
      generating: pages.filter((p) => p.status === "generating").length,
      completed: pages.filter((p) => p.status === "completed").length,
      failed: pages.filter((p) => p.status === "failed").length,
    };

    return {
      book,
      plan,
      pages,
      cover,
      stats,
    };
  },

  async updatePlan(userId: string, bookId: string, updates: { title?: string; subtitle?: string; approved?: boolean }) {
    await getOwnedBook(userId, bookId);
    return prisma.$transaction(async (tx) => {
      const bookUpdates: { title?: string; subtitle?: string } = {};
      if (updates.title?.trim()) bookUpdates.title = updates.title.trim();
      if (typeof updates.subtitle === "string") bookUpdates.subtitle = updates.subtitle.trim();

      if (Object.keys(bookUpdates).length > 0) {
        await tx.book.update({ where: { id: bookId }, data: bookUpdates });
      }

      const plan = await tx.coloringPlan.update({
        where: { bookId },
        data: {
          ...(updates.approved ? { approvedAt: new Date() } : {}),
        },
      });

      return { plan };
    });
  },

  async updatePage(userId: string, bookId: string, pageId: string, updates: ColoringPageUpdateInput) {
    await getOwnedBook(userId, bookId);
    const page = await prisma.coloringPage.findFirst({ where: { id: pageId, bookId } });
    if (!page) throw notFound("Coloring page");

    if (updates.assetId) {
      const asset = await prisma.asset.findFirst({
        where: { id: updates.assetId, userId, status: "ready" },
        select: { id: true },
      });
      if (!asset) throw notFound("Asset");
    }

    return prisma.coloringPage.update({
      where: { id: pageId },
      data: {
        ...(updates.title !== undefined ? { title: updates.title } : {}),
        ...(updates.description !== undefined ? { description: updates.description } : {}),
        ...(updates.prompt !== undefined ? { prompt: updates.prompt } : {}),
        ...(updates.negativePrompt !== undefined ? { negativePrompt: updates.negativePrompt } : {}),
        ...(updates.caption !== undefined ? { caption: updates.caption } : {}),
        ...(updates.assetId ? { assetId: updates.assetId, status: "completed", error: null } : {}),
      },
    });
  },

  async reorderPages(userId: string, bookId: string, pageIds: string[]) {
    await getOwnedBook(userId, bookId);
    const currentPages = await prisma.coloringPage.findMany({
      where: { bookId },
      select: { id: true },
    });

    if (currentPages.length !== pageIds.length || new Set(pageIds).size !== pageIds.length) {
      throw badRequest("Reorder list length does not match total book pages");
    }

    const currentIdSet = new Set(currentPages.map((p) => p.id));
    for (const id of pageIds) {
      if (!currentIdSet.has(id)) {
        throw badRequest(`Page id ${id} does not belong to this coloring book`);
      }
    }

    return prisma.$transaction(async (tx) => {
      // Step 1: Shift to negative numbers to prevent unique constraint collisions
      for (let i = 0; i < pageIds.length; i++) {
        await tx.coloringPage.update({
          where: { id: pageIds[i] },
          data: { pageNumber: -(i + 1) },
        });
      }
      // Step 2: Assign final positive sequence
      for (let i = 0; i < pageIds.length; i++) {
        await tx.coloringPage.update({
          where: { id: pageIds[i] },
          data: { pageNumber: i + 1 },
        });
      }

      return tx.coloringPage.findMany({
        where: { bookId },
        orderBy: { pageNumber: "asc" },
      });
    });
  },

  async addPage(userId: string, bookId: string, data: { title: string; prompt: string; description?: string }) {
    await getOwnedBook(userId, bookId);
    const maxPage = await prisma.coloringPage.aggregate({
      where: { bookId },
      _max: { pageNumber: true },
    });
    const nextPageNumber = (maxPage._max.pageNumber ?? 0) + 1;

    return prisma.$transaction(async (tx) => {
      const page = await tx.coloringPage.create({
        data: {
          bookId,
          pageNumber: nextPageNumber,
          title: data.title.trim(),
          description: data.description?.trim() || "",
          prompt: data.prompt.trim(),
          status: "pending",
        },
      });

      await tx.coloringPlan.update({
        where: { bookId },
        data: { pageCount: { increment: 1 } },
      });

      return page;
    });
  },

  async deletePage(userId: string, bookId: string, pageId: string) {
    await getOwnedBook(userId, bookId);
    const page = await prisma.coloringPage.findFirst({ where: { id: pageId, bookId } });
    if (!page) throw notFound("Coloring page");

    const totalPages = await prisma.coloringPage.count({ where: { bookId } });
    if (totalPages <= 1) {
      throw badRequest("A coloring book must have at least one page");
    }

    return prisma.$transaction(async (tx) => {
      await tx.coloringPage.delete({ where: { id: pageId } });
      const remainingPages = await tx.coloringPage.findMany({
        where: { bookId },
        orderBy: { pageNumber: "asc" },
      });

      // Re-index remaining pages
      for (let i = 0; i < remainingPages.length; i++) {
        await tx.coloringPage.update({
          where: { id: remainingPages[i].id },
          data: { pageNumber: -(i + 1) },
        });
      }
      for (let i = 0; i < remainingPages.length; i++) {
        await tx.coloringPage.update({
          where: { id: remainingPages[i].id },
          data: { pageNumber: i + 1 },
        });
      }

      await tx.coloringPlan.update({
        where: { bookId },
        data: { pageCount: remainingPages.length },
      });

      return { remainingCount: remainingPages.length };
    });
  },
};
