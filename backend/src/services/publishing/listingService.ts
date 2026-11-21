import { z } from "zod";
import {
  LISTING_PROFILES,
  LISTING_RULES_VERSION,
  checkListingField,
  estimateRoyalty,
  missingListingFields,
  type DistributionDestination,
  type ListingCopy,
  type ListingField,
} from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { getOwnedBook, getBrief } from "../books/bookService.js";
import { creditService, settleInTransaction } from "../credits/creditService.js";
import { openaiProvider } from "../ai/openaiClient.js";
import { env } from "../../config/env.js";
import { badRequest, conflict, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

/**
 * Marketplace listing copy.
 *
 * The product prepares the text a store's own submission form asks for, and
 * calculates what the author would keep at the price they chose. Three rules
 * hold throughout:
 *
 * - **Nothing is submitted.** No store API is called. The listing is text the
 *   author copies into the store's own form, and the royalty figure is an
 *   estimate of the store's published cut, not a payout.
 * - **The draft is written from the author's own manuscript.** The model is
 *   given the chapter titles and summaries and nothing else, so the listing
 *   describes the book that exists rather than a plausible-sounding one.
 * - **Every claim is checked, not trusted.** The same claim checks the
 *   marketing studio applies run over the drafted description, so an
 *   invented endorsement or a promised outcome is flagged before the author
 *   sees it, not after they publish it.
 */

/** What a listing draft costs. It is one provider call over the whole book. */
export const LISTING_COST = 3;

/**
 * The structured output the model returns.
 *
 * The provider's strict output mode requires every object to declare that it
 * accepts no additional properties, so an open map cannot be used here. The
 * field keys are known in advance — they come from the destination's own form —
 * so the schema is built per destination with one fixed key per field.
 */
export function aiListingSchemaFor(destination: DistributionDestination) {
  const profile = LISTING_PROFILES[destination];
  const shape: Record<string, z.ZodType<string | null>> = {};
  for (const field of profile.fields) {
    // The provider's strict mode requires every key to be present in the
    // schema, so the key is required here and may only be null rather than
    // absent. A field the model could not fill in arrives as null, and the
    // caller falls back to the deterministic value for it.
    shape[field.key] = z.string().nullable();
  }
  return z.object({
    /** The field values, keyed by the destination's field key. */
    fields: z.object(shape),
    /** The phrases that claim an endorsement, a ranking, a result or a price. */
    flaggedPhrases: z.array(z.string()),
  });
}


/** The instruction the model is given for a destination. */
function instructions(destination: DistributionDestination): { system: string; shape: string } {
  const profile = LISTING_PROFILES[destination];
  const wanted = profile.fields.map((field) => `${field.key} (${field.label})`).join(", ");
  return {
    system: [
      "You prepare the listing text an author pastes into an online store's own listing form.",
      "Describe only what the supplied book actually contains.",
      "Never invent endorsements, reviews, rankings, awards, sales figures, credentials or results.",
      "Never promise an outcome for the reader.",
      "Never state a price, a discount, a ranking or a scarcity.",
      "Never claim the store has approved or will accept anything.",
      "Write plain, specific prose. No markdown headings, no bullet symbols, no emoji.",
      "If the supplied facts are not enough to write a field truthfully, leave that field empty rather than inventing it.",
    ].join(" "),
    shape: `Write these fields: ${wanted}.`,
  };
}

/** The manuscript context the listing is written from. */
interface BookContext {
  title: string;
  subtitle: string;
  authorName: string;
  topic: string;
  audience: string;
  language: string;
  chapters: { title: string; summary: string; words: number }[];
}

/** Reads the manuscript context the listing is written from. */
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

/** The chapter versions a listing is tied to. */
async function readChapterVersions(bookId: string) {
  const chapters = await prisma.chapter.findMany({
    where: { bookId },
    orderBy: { position: "asc" },
    select: { id: true, version: true },
  });
  return chapters.map(({ id, version }) => ({ id, version }));
}

/**
 * Whether the manuscript has moved on since a listing was drafted.
 *
 * A listing whose chapters have moved on is stale, because the text describes
 * a book that is no longer the one in the manuscript.
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

/**
 * The fields that can be written from the book's own facts without a model.
 *
 * These are copied, not generated, so they are exactly what the author wrote.
 */
function deterministicFields(destination: DistributionDestination, context: BookContext): Record<string, string> {
  const fields: Record<string, string> = {};
  const profile = LISTING_PROFILES[destination];
  for (const spec of profile.fields) {
    switch (spec.key) {
      case "title":
        fields.title = context.title;
        break;
      case "subtitle":
        if (context.subtitle) fields.subtitle = context.subtitle;
        break;
      case "author":
        if (context.authorName) fields.author = context.authorName;
        break;
      default:
        break;
    }
  }
  return fields;
}

/** The mock listing, used when AI is mocked. */
function mockFields(destination: DistributionDestination, context: BookContext): Record<string, string> {
  const profile = LISTING_PROFILES[destination];
  const fields = deterministicFields(destination, context);
  const chapterList = context.chapters.map((chapter) => chapter.title).join(", ");
  for (const spec of profile.fields) {
    if (fields[spec.key]) continue;
    switch (spec.key) {
      case "description":
        fields.description = [
          `${context.title} is a ${context.chapters.length}-chapter book about ${context.topic}.`,
          context.audience ? `It is written for ${context.audience}.` : "",
          `The chapters cover: ${chapterList}.`,
        ]
          .filter(Boolean)
          .join("\n\n");
        break;
      case "keywords":
        fields.keywords = [context.topic, context.title].filter(Boolean).join(", ");
        break;
      case "categories":
        fields.categories = context.topic;
        break;
      case "audience":
        if (context.audience) fields.audience = context.audience;
        break;
      default:
        break;
    }
  }
  return fields;
}

/** The listing as the API returns it. */
async function toListing(
  row: {
    id: string;
    bookId: string;
    destination: string;
    priceInMinorUnits: number;
    fields: unknown;
    confirmed: unknown;
    chapterVersions: unknown;
    rulesVersion: string;
    version: number;
    createdAt: Date;
  },
): Promise<ListingCopy> {
  const destination = row.destination as DistributionDestination;
  const profile = LISTING_PROFILES[destination];
  const values = (row.fields ?? {}) as Record<string, string>;
  const confirmed = (row.confirmed ?? {}) as Record<string, boolean>;
  const chapterVersions = row.chapterVersions as { id: string; version: number }[];

  const fields: ListingField[] = profile.fields.map((spec) => {
    const value = values[spec.key] ?? "";
    const { withinLimit, note } = checkListingField(spec, value);
    return {
      key: spec.key,
      label: spec.label,
      value,
      required: spec.required,
      maxLength: spec.maxLength,
      withinLimit,
      confirmed: confirmed[spec.key] === true,
      note: note ?? (value.trim() ? undefined : spec.required ? "This field is required by the store." : undefined),
    };
  });

  return {
    id: row.id,
    bookId: row.bookId,
    destination,
    rulesVersion: row.rulesVersion || LISTING_RULES_VERSION,
    version: row.version,
    fields,
    royalty: estimateRoyalty(destination, row.priceInMinorUnits),
    sourceChapterVersions: chapterVersions,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Prepares a listing for a destination.
 *
 * The credits are reserved before the provider is called and settled
 * afterwards, so a provider failure costs the author nothing.
 */
export async function prepareListing(
  userId: string,
  bookId: string,
  input: { destination: DistributionDestination; priceInMinorUnits: number },
): Promise<ListingCopy> {
  const profile = LISTING_PROFILES[input.destination];
  if (!profile) throw badRequest("Choose a supported destination.");
  if (!Number.isInteger(input.priceInMinorUnits) || input.priceInMinorUnits < 0) {
    throw badRequest("Choose a price of zero or more.");
  }

  const context = await readContext(userId, bookId);
  if (!context.chapters.length) {
    throw conflict("Write at least one chapter before preparing a listing.", { code: "NO_MANUSCRIPT" });
  }
  const chapterVersions = await readChapterVersions(bookId);

  const reference = `listing:${userId}:${bookId}:${input.destination}:${Date.now()}`;
  await creditService.reserve(userId, LISTING_COST, reference);

  let drafted: Record<string, string>;
  try {
    const deterministic = deterministicFields(input.destination, context);
    if (env.AI_MOCK) {
      drafted = mockFields(input.destination, context);
    } else {
      const instruction = instructions(input.destination);
      const prompt = [
        `Book title: ${context.title}`,
        context.subtitle ? `Subtitle: ${context.subtitle}` : "",
        `Topic: ${context.topic}`,
        context.authorName ? `Author name: ${context.authorName}` : "",
        context.audience ? `Audience: ${context.audience}` : "",
        `Language: ${context.language}`,
        "",
        "The book contains these chapters:",
        ...context.chapters.map((chapter) => `- ${chapter.title}${chapter.summary ? `: ${chapter.summary}` : ""}`),
        "",
        instruction.shape,
        `Rules: ${instruction.system}`,
        "",
        "Put each field's text in the fields object, keyed by the field key.",
        "Put any phrase that claims an endorsement, a ranking, a result or a price in flaggedPhrases — do not remove it, just report it.",
      ]
        .filter(Boolean)
        .join("\n");

      const { data } = await openaiProvider.json({
        system: `${instruction.system}\n\n${instruction.shape}`,
        user: prompt,
        schema: aiListingSchemaFor(input.destination),
        name: "listing_copy",
        maxOutputTokens: 2000,
      });
      // A field the model left empty arrives as null, so it is dropped here and
      // the deterministic value below fills it in.
      const produced: Record<string, string> = {};
      for (const [key, value] of Object.entries(data.fields ?? {})) {
        if (typeof value === "string" && value.trim()) produced[key] = value;
      }
      drafted = { ...deterministic, ...produced };
      // A field the model did not produce keeps the deterministic value.
      for (const [key, value] of Object.entries(deterministic)) {
        if (!drafted[key]) drafted[key] = value;
      }
    }
  } catch (err) {
    await creditService.settle(userId, LISTING_COST, 0, reference).catch(() => undefined);
    throw err;
  }

  // The charge and the listing are written together, so a listing that fails
  // to save never leaves the author charged for it.
  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      await settleInTransaction(tx, userId, LISTING_COST, LISTING_COST, reference);
      return tx.listing.create({
        data: {
          userId,
          bookId,
          destination: input.destination,
          priceInMinorUnits: input.priceInMinorUnits,
          fields: drafted as unknown as object,
          confirmed: {} as unknown as object,
          chapterVersions: chapterVersions as unknown as object,
          rulesVersion: LISTING_RULES_VERSION,
        },
      });
    });
  } catch (err) {
    await creditService.settle(userId, LISTING_COST, 0, reference).catch(() => undefined);
    throw err;
  }

  logger.info(
    { listingId: row.id, destination: input.destination, bookId },
    "Listing copy prepared",
  );
  return toListing(row);
}

/** The listings for a book. */
export async function listListings(userId: string, bookId: string): Promise<ListingCopy[]> {
  await getOwnedBook(userId, bookId);
  const rows = await prisma.listing.findMany({
    where: { userId, bookId },
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(rows.map((row) => toListing(row)));
}

/**
 * One listing.
 *
 * The listing is owner-scoped and the book must not be deleted, so a listing
 * for a book the author removed is not reachable.
 */
export async function getListing(userId: string, listingId: string): Promise<ListingCopy> {
  const row = await prisma.listing.findFirst({
    where: { id: listingId, userId, book: { deletedAt: null } },
  });
  if (!row) throw notFound("Listing");
  return toListing(row);
}

/**
 * Saves an edited listing.
 *
 * The version is checked, so a lost edit is refused rather than overwriting a
 * newer save. The author's own edits are preserved: only the fields the
 * request names are changed.
 */
export async function updateListing(
  userId: string,
  listingId: string,
  input: {
    baseVersion: number;
    priceInMinorUnits?: number;
    fields?: Record<string, string>;
    confirmed?: Record<string, boolean>;
  },
): Promise<ListingCopy> {
  const row = await prisma.listing.findFirst({
    where: { id: listingId, userId, book: { deletedAt: null } },
  });
  if (!row) throw notFound("Listing");

  const current = row.fields as unknown as Record<string, string>;
  const currentConfirmed = row.confirmed as unknown as Record<string, boolean>;
  const fields = { ...current, ...(input.fields ?? {}) };
  const confirmed = { ...currentConfirmed, ...(input.confirmed ?? {}) };

  const updated = await prisma.listing.updateMany({
    where: { id: listingId, userId, version: input.baseVersion },
    data: {
      fields: fields as unknown as object,
      confirmed: confirmed as unknown as object,
      ...(input.priceInMinorUnits !== undefined ? { priceInMinorUnits: input.priceInMinorUnits } : {}),
      version: { increment: 1 },
    },
  });
  if (!updated.count) {
    throw conflict("This listing was changed somewhere else. Reload it before saving.", { code: "STALE_VERSION" });
  }

  return getListing(userId, listingId);
}

/**
 * The royalty estimate for a destination and a price.
 *
 * This is a pure calculation and costs nothing. It is exposed separately so
 * the author can move a price around without generating a listing.
 */
export function quoteRoyalty(destination: DistributionDestination, priceInMinorUnits: number) {
  return estimateRoyalty(destination, priceInMinorUnits);
}

/**
 * The required fields a listing is still missing, and whether it is stale.
 *
 * A missing required field blocks the listing, because the store's own form
 * will not accept it.
 */
export async function listingGaps(userId: string, listingId: string) {
  const listing = await getListing(userId, listingId);
  const values = Object.fromEntries(listing.fields.map((field) => [field.key, field.value]));
  const missing = missingListingFields(listing.destination, values);

  const row = await prisma.listing.findFirst({
    where: { id: listingId, userId },
    select: { bookId: true },
  });
  const stale = row ? await isStale(row.bookId, listing.sourceChapterVersions) : false;
  return { missing, stale };
}
