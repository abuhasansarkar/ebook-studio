import { z } from "zod";
import {
  coloringBookBriefSchema,
  COLORING_LIMITS,
  COLORING_STYLE_CATALOG,
  type ColoringBookBrief,
  type ColoringPageCreateInput,
  type ColoringPageUpdateInput,
  type ColoringPlanUpdateInput,
} from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { env } from "../../config/env.js";
import { badRequest, conflict, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { openaiProvider } from "../ai/openaiClient.js";
import { getOwnedBook } from "../books/bookService.js";
import { lockProject } from "../books/libraryService.js";
import { attachAsset, collectReleasedAssets, releaseAsset } from "./coloringAssets.js";
import { coloringGenerationService, pageAssetInclude, toPublicPage } from "./coloringGenerationService.js";

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

function mockGeneratePages(brief: ColoringBookBrief) {
  const styleMeta = COLORING_STYLE_CATALOG[brief.artStyle] || COLORING_STYLE_CATALOG.cute_animals;
  const topicClean = brief.topic.trim().replace(/\.$/, "");
  const title = brief.title?.trim() || `${capitalize(topicClean)} Coloring Book`;
  const subtitle =
    brief.subtitle?.trim() ||
    `${brief.pageCount} ${styleMeta.label} Coloring Pages for ${capitalize(brief.targetAudience)}`;

  const pageConcepts: { title: string; description: string; prompt: string }[] = [];

  const adjectives = ["Happy", "Curious", "Playful", "Gentle", "Brave", "Little", "Cheerful", "Charming", "Friendly", "Sweet"];
  const environments = [
    "in a sunny flower garden",
    "beside a wooden countryside fence",
    "under a shady leafy tree",
    "splashing near a peaceful stream",
    "exploring a gentle grassy hill",
    "on a cozy picnic blanket with snacks",
    "discovering a hidden forest glade",
    "enjoying a warm morning sunrise",
    "relaxing surrounded by blooming daisies",
    "watching butterflies flutter through the air",
    "playing with a pile of autumn leaves",
    "resting beneath starry clouds",
  ];

  for (let i = 1; i <= brief.pageCount; i++) {
    const adj = adjectives[(i - 1) % adjectives.length];
    const envir = environments[(i - 1) % environments.length];
    const pageTitle = `${adj} Scene ${i}`;
    const desc = `${adj} subject ${envir}, created in ${styleMeta.label} style with clear coloring areas.`;
    const prompt = `A delightful ${styleMeta.label} illustration of ${topicClean} ${envir}. Clear line art, bold outlines, friendly mood.`;

    pageConcepts.push({
      title: pageTitle,
      description: desc,
      prompt,
    });
  }

  return { title, subtitle, pages: pageConcepts };
}

function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export const coloringPlanService = {
  async createPlan(userId: string, input: ColoringBookBrief) {
    const brief = coloringBookBriefSchema.parse(input);
    // Refuse another user's (or an archived) project before spending an AI call; re-checked under lock below.
    if (brief.projectId && !(await prisma.project.findFirst({ where: { id: brief.projectId, userId, deletedAt: null, archivedAt: null } }))) {
      throw notFound("Active project");
    }

    let planData: { title: string; subtitle: string; pages: { title: string; description: string; prompt: string }[] };

    if (env.AI_MOCK || !env.OPENAI_API_KEY) {
      planData = mockGeneratePages(brief);
    } else {
      const styleMeta = COLORING_STYLE_CATALOG[brief.artStyle] || COLORING_STYLE_CATALOG.cute_animals;
      const prompt = {
        system: [
          `You are a master coloring book designer and art director specializing in commercial, bestselling Amazon KDP coloring books.`,
          `Create a cohesive, engaging coloring book concept based on the user's idea.`,
          `You must generate EXACTLY ${brief.pageCount} distinct, imaginative, and age-appropriate page concepts.`,
          `Every page must have:`,
          `1. 'title': A short, catchy title (e.g. 'Playful Piglet in Mud').`,
          `2. 'description': A 1-2 sentence description of the action, composition, and background context.`,
          `3. 'prompt': A detailed line-art image generation prompt describing the character, pose, and background props without color words.`,
          `Style: ${styleMeta.label} (${styleMeta.description}).`,
          `Audience: ${brief.targetAudience}, Complexity: ${brief.difficulty}, Line weight: ${brief.lineThickness}.`,
        ].join("\n"),
        user: `Idea: ${brief.topic}\nSuggested Title: ${brief.title || "Auto"}\nPage Count: ${brief.pageCount}\nLanguage: ${brief.language}`,
      };

      try {
        const result = await openaiProvider.json({
          ...prompt,
          schema: aiPlanSchema,
          name: "coloring_book_plan",
          maxOutputTokens: 8000,
        });
        planData = {
          title: brief.title?.trim() || result.data.title,
          subtitle: brief.subtitle?.trim() || result.data.subtitle,
          pages: result.data.pages.slice(0, brief.pageCount),
        };
        // Fill up to pageCount if AI returned slightly fewer
        while (planData.pages.length < brief.pageCount) {
          const idx = planData.pages.length + 1;
          planData.pages.push({
            title: `Bonus Scene ${idx}`,
            description: `A charming scene matching ${brief.topic}`,
            prompt: `A beautiful coloring line art illustration of ${brief.topic}`,
          });
        }
      } catch {
        planData = mockGeneratePages(brief);
      }
    }

    return prisma.$transaction(async (tx) => {
      if (brief.projectId) await lockProject(tx, userId, brief.projectId, true);
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

      const createdPages = await Promise.all(
        planData.pages.map((p, idx) =>
          tx.coloringPage.create({
            data: {
              bookId: book.id,
              pageNumber: idx + 1,
              title: p.title,
              description: p.description,
              prompt: p.prompt,
              status: "pending",
            },
          }),
        ),
      );

      return {
        book,
        plan: coloringPlan,
        pages: createdPages,
      };
    });
  },

  async getPlan(userId: string, bookId: string) {
    const book = await getOwnedBook(userId, bookId);
    const plan = await prisma.coloringPlan.findUnique({ where: { bookId } });
    if (!plan) throw notFound("Coloring book plan");

    // Self-heal pages a dead worker or a previous release left generating (cheap: scoped to this book).
    if (await prisma.coloringPage.count({ where: { bookId, status: "generating" } })) {
      await coloringGenerationService.recoverStale({ bookId }).catch((err) => logger.warn({ err, bookId }, "Coloring recovery deferred"));
    }

    const pages = (await prisma.coloringPage.findMany({
      where: { bookId },
      orderBy: { pageNumber: "asc" },
      include: pageAssetInclude,
    })).map((p) => toPublicPage(p, userId));

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

  async updatePlan(userId: string, bookId: string, updates: ColoringPlanUpdateInput) {
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
    const { page, released } = await prisma.$transaction(async (tx) => {
      const current = await tx.coloringPage.findFirst({ where: { id: pageId, bookId } });
      if (!current) throw notFound("Coloring page");
      const swapAsset = Boolean(updates.assetId) && updates.assetId !== current.assetId;
      if (swapAsset) {
        if (current.status === "generating") throw conflict("This page is generating. Wait for it to finish before choosing another image.");
        // Only an image the author owns, and that is ready, may be placed on a page.
        await attachAsset(tx, userId, bookId, updates.assetId!);
      }
      const updated = await tx.coloringPage.update({
        where: { id: pageId },
        data: {
          ...(updates.title !== undefined ? { title: updates.title } : {}),
          ...(updates.description !== undefined ? { description: updates.description } : {}),
          ...(updates.prompt !== undefined ? { prompt: updates.prompt } : {}),
          ...(updates.negativePrompt !== undefined ? { negativePrompt: updates.negativePrompt } : {}),
          ...(updates.caption !== undefined ? { caption: updates.caption } : {}),
          ...(swapAsset ? { assetId: updates.assetId, status: "completed", error: null } : {}),
        },
        include: pageAssetInclude,
      });
      const released = swapAsset && current.assetId ? await releaseAsset(tx, userId, bookId, current.assetId) : null;
      return { page: updated, released };
    });
    await collectReleasedAssets([released]);
    return toPublicPage(page, userId);
  },

  async reorderPages(userId: string, bookId: string, pageIds: string[]) {
    await getOwnedBook(userId, bookId);
    const currentPages = await prisma.coloringPage.findMany({
      where: { bookId },
      select: { id: true },
    });

    if (currentPages.length !== pageIds.length) {
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

  async addPage(userId: string, bookId: string, data: ColoringPageCreateInput) {
    await getOwnedBook(userId, bookId);
    if ((await prisma.coloringPage.count({ where: { bookId } })) >= COLORING_LIMITS.maxPages) {
      throw badRequest(`A coloring book can hold up to ${COLORING_LIMITS.maxPages} pages.`);
    }
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

    const { result, released } = await prisma.$transaction(async (tx) => {
      await tx.coloringPage.delete({ where: { id: pageId } });
      const released = page.assetId ? await releaseAsset(tx, userId, bookId, page.assetId) : null;
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

      return { result: { remainingCount: remainingPages.length }, released };
    });
    await collectReleasedAssets([released]);
    return result;
  },
};
