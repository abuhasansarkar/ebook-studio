import { z } from "zod";
import {
  MARKETING_GRAPHIC_SIZES,
  MARKETING_LIST_TYPES,
  MARKETING_OUTPUT_LABELS,
  marketingFlags,
  type MarketingDraft,
  type MarketingFlag,
  type MarketingGraphic,
  type MarketingGraphicInput,
  type MarketingOutputType,
  type MarketingTone,
} from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { getOwnedBook, getBrief } from "../books/bookService.js";
import { randomUUID } from "node:crypto";
import { creditService, settleInTransaction } from "../credits/creditService.js";
import { openaiProvider } from "../ai/openaiClient.js";
import { env } from "../../config/env.js";
import { badRequest, conflict, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

/**
 * S15 — the marketing studio.
 *
 * The studio drafts launch material from a book the author has written. Three
 * rules hold throughout:
 *
 * - Nothing is published, sent or posted. The studio produces text and
 *   images the author downloads and uses themselves. There is no outbound
 *   action anywhere in this service.
 * - The draft is editable and the edit is preserved. A regeneration writes a
 *   new draft; it never overwrites an edited one.
 * - The draft is tied to the manuscript it came from. The chapter versions
 *   are captured, and a draft whose chapters have moved on is marked stale.
 */

/** The rules version this build applies. */
export const MARKETING_RULES_VERSION = "2026-11-26.1";

/** What a draft costs, by the size of the output. */
export const MARKETING_COSTS: Record<MarketingOutputType, number> = {
  description: 2,
  summary: 2,
  author_bio: 1,
  sales_copy: 3,
  keywords: 1,
  email_draft: 2,
  social_caption: 1,
  carousel_outline: 2,
  video_script: 3,
};

/**
 * The structured output the model returns.
 *
 * The shape is strict, because every field has to be present for the strict
 * output mode the provider uses.
 */
const aiMarketingSchema = z.object({
  content: z.string(),
  /** The phrases the model believes need the author's attention. */
  flaggedPhrases: z.array(z.string()),
});

/** The instruction the model is given for each output type. */
const INSTRUCTIONS: Record<MarketingOutputType, { system: string; shape: string }> = {
  description: {
    system:
      "You write a store description for a book. Describe what the book actually covers and who it is for. Write in plain, specific prose. Never invent endorsements, rankings, awards, reviews, sales figures or results. Never promise outcomes. Never state a price.",
    shape: "Two to four paragraphs of plain prose, with no headings and no markdown.",
  },
  summary: {
    system:
      "You write a back-cover summary. Summarise what the reader will learn, using only what the book actually contains. Never invent endorsements, rankings, awards or results. Never promise outcomes.",
    shape: "One paragraph, about 120 to 180 words, with no headings and no markdown.",
  },
  author_bio: {
    system:
      "You write a short author biography from the facts supplied. Use only the supplied facts. If a fact is missing, write around it rather than inventing it. Never claim credentials, qualifications or experience that were not supplied. Never claim awards or recognition.",
    shape: "One paragraph, about 60 to 100 words, in the third person.",
  },
  sales_copy: {
    system:
      "You write sales-page copy. Be specific about what the reader gets. Never invent endorsements, rankings, awards, testimonials, sales figures or guaranteed results. Never state a price.",
    shape: "A short opening line, two or three short sections, and a closing line. Use plain headings.",
  },
  keywords: {
    system:
      "You choose search keywords for a book. Use only terms that describe what the book actually contains. Never include a competitor's name or a trademark you were not given.",
    shape: "A plain list of keywords, one per line, with no numbering and no commentary.",
  },
  email_draft: {
    system:
      "You draft an email to people who already asked to hear from this author. Keep it short and personal. Do not invent urgency, scarcity, discounts or deadlines. Do not include a subject line that promises something the book does not deliver.",
    shape: "A subject line on the first line, then a blank line, then the body. Plain text.",
  },
  social_caption: {
    system:
      "You write a short social media caption. Keep it under 280 characters. Never invent results, endorsements or urgency. Do not add hashtags the author did not ask for.",
    shape: "One caption, plain text, no hashtags unless the instruction asks for them.",
  },
  carousel_outline: {
    system:
      "You outline a carousel of slides that introduces the book. Each slide carries one idea drawn from the book. Never invent results or endorsements.",
    shape: "One line per slide in the form `Slide N — headline — supporting line`.",
  },
  video_script: {
    system:
      "You write a short video script that introduces the book. Describe what the book covers. Never invent endorsements, rankings, awards or results. Never promise outcomes.",
    shape: "A short scene-by-scene script with a spoken line per scene, in the form `Scene N — visual — line`.",
  },
};

/** The manuscript context the model is given. */
interface BookContext {
  title: string;
  subtitle: string;
  authorName: string;
  topic: string;
  audience: string;
  language: string;
  chapters: { title: string; summary: string; words: number }[];
}

/** Reads the manuscript context the drafts are written from. */
async function readContext(userId: string, bookId: string): Promise<BookContext> {
  const book = await getOwnedBook(userId, bookId);
  const brief = await getBrief(bookId).catch(() => null);
  const chapters = await prisma.chapter.findMany({
    where: { bookId },
    orderBy: { position: "asc" },
    select: { title: true, summary: true, wordCount: true, status: true },
  });
  return {
    title: book.title,
    subtitle: book.subtitle ?? "",
    authorName: brief?.authorName ?? "",
    topic: brief?.topic ?? book.title,
    audience: brief?.targetAudience ?? "",
    language: book.language,
    chapters: chapters.map((chapter) => ({
      title: chapter.title,
      summary: chapter.summary ?? "",
      words: chapter.wordCount ?? 0,
    })),
  };
}

/** The chapter versions a draft is tied to. */
async function readChapterVersions(bookId: string) {
  const chapters = await prisma.chapter.findMany({
    where: { bookId },
    orderBy: { position: "asc" },
    select: { id: true, version: true },
  });
  return chapters.map(({ id, version }) => ({ id, version }));
}

/**
 * Whether the manuscript has moved on since a draft was written.
 *
 * A draft is stale when any chapter it was written from has a newer version.
 */
async function isStale(bookId: string, chapterVersions: { id: string; version: number }[]): Promise<boolean> {
  if (!chapterVersions.length) return false;
  const current = await prisma.chapter.findMany({
    where: { bookId, id: { in: chapterVersions.map((chapter) => chapter.id) } },
    select: { id: true, version: true },
  });
  const versions = new Map(current.map((chapter) => [chapter.id, chapter.version]));
  return chapterVersions.some((chapter) => (versions.get(chapter.id) ?? chapter.version) !== chapter.version);
}

/** The mock draft, used when AI is mocked. */
function mockContent(outputType: MarketingOutputType, context: BookContext, tone: MarketingTone, audience: string): string {
  const who = audience || context.audience || "readers who want practical guidance";
  switch (outputType) {
    case "keywords":
      return [context.topic, context.title, "practical guide", "how to", "step by step"].slice(0, 5).join("\n");
    case "carousel_outline":
      return context.chapters
        .slice(0, 5)
        .map((chapter, index) => `Slide ${index + 1} — ${chapter.title} — What you will learn about ${chapter.title.toLowerCase()}.`)
        .join("\n");
    case "video_script":
      return context.chapters
        .slice(0, 3)
        .map((chapter, index) => `Scene ${index + 1} — The author on camera — In ${context.title}, chapter ${index + 1} covers ${chapter.title}.`)
        .join("\n");
    case "author_bio":
      return `${context.authorName || "The author"} writes about ${context.topic} for ${who}.`;
    case "email_draft":
      return `A note about ${context.title}\n\nHello,\n\n${context.title} is out now. It covers ${context.chapters.length} chapters on ${context.topic}.`;
    case "social_caption":
      return `New: ${context.title} — a practical guide to ${context.topic}.`;
    case "summary":
      return `${context.title} is a practical guide to ${context.topic}. It covers ${context.chapters.length} chapters, each written for ${who}.`;
    case "sales_copy":
      return `What you will learn\n\n${context.chapters.slice(0, 3).map((chapter) => `— ${chapter.title}`).join("\n")}\n\nWho it is for\n\n${who}`;
    default:
      return `${context.title} is a practical guide to ${context.topic}.\n\nIt covers ${context.chapters.length} chapters, written for ${who}. Each chapter gives the practical steps and the reasons behind them.`;
  }
}

/** The draft as the API returns it. */
async function toDraft(row: {
  id: string;
  bookId: string;
  outputType: string;
  status: string;
  content: string;
  tone: string;
  audience: string | null;
  instruction: string | null;
  chapterVersions: unknown;
  rulesVersion: string;
  flags: unknown;
  creditsCharged: number;
  createdAt: Date;
  updatedAt: Date;
}): Promise<MarketingDraft> {
  const chapterVersions = row.chapterVersions as { id: string; version: number }[];
  const stale = await isStale(row.bookId, chapterVersions);
  const flags = marketingFlags(row.content, { stale });
  return {
    id: row.id,
    bookId: row.bookId,
    outputType: row.outputType as MarketingOutputType,
    status: row.status as MarketingDraft["status"],
    content: row.content,
    tone: row.tone as MarketingTone,
    audience: row.audience ?? undefined,
    instruction: row.instruction ?? undefined,
    chapterVersions,
    rulesVersion: row.rulesVersion,
    flags,
    stale,
    creditsCharged: row.creditsCharged,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Drafts a piece of marketing material.
 *
 * The credits are reserved before the provider is called and settled
 * afterwards, so a provider failure does not cost the author anything.
 */
export async function createDraft(
  userId: string,
  bookId: string,
  input: {
    outputType: MarketingOutputType;
    tone: MarketingTone;
    audience?: string;
    instruction?: string;
    authorName?: string;
  },
): Promise<MarketingDraft> {
  const context = await readContext(userId, bookId);
  if (!context.chapters.length) {
    throw conflict("Write at least one chapter before drafting marketing material.", { code: "NO_MANUSCRIPT" });
  }
  const chapterVersions = await readChapterVersions(bookId);
  const cost = MARKETING_COSTS[input.outputType] ?? 2;

  // One reference for the whole operation, so the reservation and the
  // settlement are the same ledger entry. A failed draft releases the
  // reservation and costs the author nothing.
  // Unique per request (a timestamp can repeat within a millisecond and merge
  // two reservations into one). Tracked until settled, so a crash in between
  // is released by the stale-reservation sweeper.
  const reference = `marketing:${userId}:${bookId}:${input.outputType}:${randomUUID()}`;

  await creditService.reserve(userId, cost, reference);

  let content: string;
  try {
    if (env.AI_MOCK) {
      content = mockContent(input.outputType, context, input.tone, input.audience ?? "");
    } else {
      const instruction = INSTRUCTIONS[input.outputType];
      const prompt = [
        `Book title: ${context.title}`,
        context.subtitle ? `Subtitle: ${context.subtitle}` : "",
        `Topic: ${context.topic}`,
        input.authorName ? `Author name to use: ${input.authorName}` : context.authorName ? `Author name: ${context.authorName}` : "",
        input.audience ? `Audience: ${input.audience}` : context.audience ? `Audience: ${context.audience}` : "",
        `Tone: ${input.tone}`,
        input.instruction ? `The author's instruction: ${input.instruction}` : "",
        "",
        "The book contains these chapters:",
        ...context.chapters.map((chapter) => `- ${chapter.title}${chapter.summary ? `: ${chapter.summary}` : ""}`),
        "",
        `Write the ${MARKETING_OUTPUT_LABELS[input.outputType].toLowerCase()}. ${instruction.shape}`,
        `Rules: ${instruction.system}`,
      ]
        .filter(Boolean)
        .join("\n");

      const { data } = await openaiProvider.json({
        system: `${instruction.system}\n\n${instruction.shape}\n\nPut the finished text in "content". Put any phrase that claims an endorsement, a ranking, a result or a price in "flaggedPhrases" — do not remove it, just report it.`,
        user: prompt,
        schema: aiMarketingSchema,
        name: "marketing_copy",
        maxOutputTokens: 4000,
      });
      content = data.content.trim();
    }
  } catch (err) {
    // The reservation is released, so a failed provider call costs nothing.
    await creditService.settle(userId, cost, 0, reference).catch(() => undefined);
    throw err;
  }

  // The charge and the draft are written together: a draft that fails to save
  // must not leave the author charged for text they never received.
  const flags = marketingFlags(content);
  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      await settleInTransaction(tx, userId, cost, cost, reference);
      return tx.marketingDraft.create({
    data: {
      userId,
      bookId,
      outputType: input.outputType,
      status: "draft",
      content,
      tone: input.tone,
      audience: input.audience ?? null,
      instruction: input.instruction ?? null,
      chapterVersions: chapterVersions as unknown as object,
      rulesVersion: MARKETING_RULES_VERSION,
      flags: flags as unknown as object,
      creditsCharged: cost,
    },
      });
    });
  } catch (err) {
    await creditService.settle(userId, cost, 0, reference).catch(() => undefined);
    throw err;
  }

  logger.info({ bookId, outputType: input.outputType, credits: cost }, "Marketing draft created");
  return toDraft(row);
}

/** The drafts for a book, newest first. */
export async function listDrafts(userId: string, bookId: string): Promise<MarketingDraft[]> {
  await getOwnedBook(userId, bookId);
  const rows = await prisma.marketingDraft.findMany({
    where: { userId, bookId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return Promise.all(rows.map((row) => toDraft(row)));
}

/** One draft. */
export async function getDraft(userId: string, draftId: string): Promise<MarketingDraft> {
  const row = await prisma.marketingDraft.findFirst({
    where: { id: draftId, userId, book: { deletedAt: null } },
  });
  if (!row) throw notFound("Draft");
  return toDraft(row);
}

/**
 * Saves an edited draft.
 *
 * The version is checked, so an edit in one tab does not silently overwrite
 * an edit in another. The status moves from `draft` to `edited`, and to
 * `approved` when the author says so.
 */
export async function saveDraft(
  userId: string,
  draftId: string,
  input: { content: string; baseVersion?: number; approve: boolean },
): Promise<MarketingDraft> {
  const row = await prisma.marketingDraft.findFirst({
    where: { id: draftId, userId, book: { deletedAt: null } },
  });
  if (!row) throw notFound("Draft");
  if (input.baseVersion !== undefined && input.baseVersion !== row.version) {
    throw conflict("This draft changed in another tab. Reload it and reapply your edit.", {
      code: "STALE_VERSION",
      currentVersion: row.version,
    });
  }
  if (input.content === row.content && !input.approve) return toDraft(row);

  const flags = marketingFlags(input.content);
  const updated = await prisma.marketingDraft.update({
    where: { id: row.id },
    data: {
      content: input.content,
      status: input.approve ? "approved" : "edited",
      flags: flags as unknown as object,
      version: { increment: 1 },
    },
  });
  return toDraft(updated);
}

/**
 * Regenerates a draft into a new variant.
 *
 * The existing draft is left alone. An author's manual edit is never
 * overwritten by a regeneration.
 */
export async function regenerateDraft(userId: string, draftId: string): Promise<MarketingDraft> {
  const row = await prisma.marketingDraft.findFirst({
    where: { id: draftId, userId, book: { deletedAt: null } },
  });
  if (!row) throw notFound("Draft");
  return createDraft(userId, row.bookId, {
    outputType: row.outputType as MarketingOutputType,
    tone: row.tone as MarketingTone,
    audience: row.audience ?? undefined,
    instruction: row.instruction ?? undefined,
  });
}

/** The credit cost of each output type, so the interface can show it first. */
export function marketingCosts() {
  return Object.entries(MARKETING_COSTS).map(([outputType, credits]) => ({
    outputType: outputType as MarketingOutputType,
    label: MARKETING_OUTPUT_LABELS[outputType as MarketingOutputType],
    credits,
    isList: MARKETING_LIST_TYPES.includes(outputType as MarketingOutputType),
  }));
}

/**
 * Composes a promotional graphic.
 *
 * The graphic is rendered with the same private asset pipeline the cover
 * studio uses, so it never reaches an external image service.
 */
export async function createGraphic(
  userId: string,
  bookId: string,
  input: MarketingGraphicInput,
): Promise<MarketingGraphic> {
  await getOwnedBook(userId, bookId);
  const size = MARKETING_GRAPHIC_SIZES[input.template];

  const row = await prisma.marketingGraphic.create({
    data: {
      userId,
      bookId,
      template: input.template,
      width: size.width,
      height: size.height,
      headline: input.headline,
      subhead: input.subhead ?? null,
      callToAction: input.callToAction ?? null,
      textColor: input.textColor,
      backgroundColor: input.backgroundColor,
      usedCover: input.useCover,
    },
  });

  return toGraphic(row);
}

/** The graphic as the API returns it. */
function toGraphic(row: {
  id: string;
  bookId: string;
  template: string;
  width: number;
  height: number;
  headline: string;
  subhead: string | null;
  callToAction: string | null;
  textColor: string;
  backgroundColor: string;
  usedCover: boolean;
  storageKey: string | null;
  ready: boolean;
  createdAt: Date;
}): MarketingGraphic {
  return {
    id: row.id,
    bookId: row.bookId,
    template: row.template as MarketingGraphic["template"],
    width: row.width,
    height: row.height,
    headline: row.headline,
    subhead: row.subhead ?? undefined,
    callToAction: row.callToAction ?? undefined,
    textColor: row.textColor,
    backgroundColor: row.backgroundColor,
    usedCover: row.usedCover,
    storageKey: row.storageKey ?? undefined,
    ready: row.ready,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The graphics for a book. */
export async function listGraphics(userId: string, bookId: string): Promise<MarketingGraphic[]> {
  await getOwnedBook(userId, bookId);
  const rows = await prisma.marketingGraphic.findMany({
    where: { userId, bookId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((row) => toGraphic(row));
}

/** One graphic. */
export async function getGraphic(userId: string, graphicId: string): Promise<MarketingGraphic> {
  const row = await prisma.marketingGraphic.findFirst({
    where: { id: graphicId, userId, book: { deletedAt: null } },
  });
  if (!row) throw notFound("Graphic");
  return toGraphic(row);
}
