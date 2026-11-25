import { assertIdle, lockBook } from '../generation/jobRuntime.js';
import { pinImages } from '../assets/assetService.js';
import { randomUUID } from "node:crypto";
import { CREDIT_COSTS, documentError, imageAssetIds, type AssistAction } from "@ebook/shared";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { badRequest, conflict, notFound } from "../../utils/errors.js";
import { aiService } from "../ai/aiService.js";
import { getOwnedBook } from "../books/bookService.js";
import { creditService } from "../credits/creditService.js";
import { countWords, markdownToTiptap, tiptapToText, type PMNode } from "./markdownToTiptap.js";

async function getOwnedChapter(userId: string, chapterId: string) {
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, book: { userId, deletedAt: null } },
    include: { book: { select: { id: true, language: true, title: true } } },
  });
  if (!chapter) throw notFound("Chapter");
  return chapter;
}

function assertDoc(json: unknown): asserts json is PMNode {
  const error = documentError(json);
  if (error) throw badRequest(error);
}

export const chapterService = {
  async create(userId: string, bookId: string, input: { title?: string }) {
    await getOwnedBook(userId, bookId);
    return prisma.$transaction(async (tx) => {
      await lockBook(tx, bookId, userId);
      await assertIdle(tx, bookId);

      const count = await tx.chapter.count({ where: { bookId } });
      const last = await tx.chapter.findFirst({
        where: { bookId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const position = last !== null ? last.position + 1 : 0;
      const title = input.title?.trim() || `Chapter ${count + 1}`;
      const defaultDoc = { type: "doc", content: [{ type: "paragraph" }] };

      const chapter = await tx.chapter.create({
        data: {
          bookId,
          position,
          title,
          goal: "",
          keyPoints: [],
          targetWords: 1500,
          status: "pending",
          contentJson: defaultDoc,
          wordCount: 0,
          version: 0,
        },
      });

      await tx.book.update({ where: { id: bookId }, data: { updatedAt: new Date() } });
      return chapter;
    });
  },

  async listForBook(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    return prisma.chapter.findMany({
      where: { bookId },
      orderBy: { position: "asc" },
      select: { id: true, position: true, title: true, status: true, wordCount: true, version: true, updatedAt: true },
    });
  },

  async get(userId: string, chapterId: string) {
    const { summary: _summary, ...chapter } = await getOwnedChapter(userId, chapterId);
    return chapter;
  },

  /**
   * Optimistic concurrency: the update only applies if `version` matches the stored one.
   * A stale version returns 409 with the current server state so the client can resolve it.
   */
  async update(userId: string, chapterId: string, input: { title?: string; contentJson?: Record<string, unknown>; version: number }) {
    if (input.contentJson !== undefined) assertDoc(input.contentJson);
    return prisma.$transaction(async (tx) => {
      const identity = await tx.chapter.findFirst({ where: { id: chapterId, book: { userId, deletedAt: null } }, select: { bookId: true } });
      if (!identity) throw notFound('Chapter');
      await lockBook(tx, identity.bookId, userId);
      const current = await tx.chapter.findFirst({ where: { id: chapterId, book: { userId, deletedAt: null } } });
      if (!current) throw notFound("Chapter");
      if (current.status === "generating") throw conflict("This chapter is being written by AI. Please wait until it finishes.");

      const stale = () => conflict("This chapter was changed somewhere else (another tab or device).", {
        currentVersion: current.version, updatedAt: current.updatedAt, title: current.title, contentJson: current.contentJson,
      });
      if (current.version !== input.version) throw stale();
      if (input.contentJson !== undefined) await pinImages(tx, userId, current.bookId, input.contentJson);
      const wordCount = input.contentJson !== undefined ? countWords(tiptapToText(input.contentJson as unknown as PMNode)) : current.wordCount;
      const res = await tx.chapter.updateMany({
        where: { id: chapterId, version: input.version, status: { not: "generating" } },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.contentJson !== undefined ? { contentJson: input.contentJson as object, wordCount, summary: null } : {}),
          version: { increment: 1 },
          ...(input.contentJson !== undefined ? { status: wordCount > 0 || imageAssetIds(input.contentJson).length > 0 ? "done" : "pending", error: null } : {}),
        },
      });
      if (res.count === 0) {
        const latest = await tx.chapter.findUniqueOrThrow({ where: { id: chapterId } });
        throw conflict("This chapter changed while saving. Please review the latest version.", {
          currentVersion: latest.version, updatedAt: latest.updatedAt, title: latest.title, contentJson: latest.contentJson,
        });
      }
      // The snapshot and edit commit together; a rejected save never creates history.
      await tx.documentVersion.create({ data: {
        chapterId, version: current.version, title: current.title,
        contentJson: current.contentJson ?? Prisma.DbNull,
        wordCount: current.wordCount, savedAt: current.updatedAt,
      } });
      await tx.book.update({ where: { id: current.bookId }, data: { updatedAt: new Date() } });
      return tx.chapter.findUniqueOrThrow({
        where: { id: chapterId },
        select: { id: true, title: true, version: true, wordCount: true, status: true, updatedAt: true },
      });
    });
  },

  async listVersions(userId: string, chapterId: string, before?: number) {
    await getOwnedChapter(userId, chapterId);
    const versions = await prisma.documentVersion.findMany({
      where: { chapterId, ...(before !== undefined ? { version: { lt: before } } : {}) },
      orderBy: { version: "desc" }, take: 21,
      select: { id: true, version: true, title: true, wordCount: true, savedAt: true },
    });
    const items = versions.slice(0, 20);
    return { versions: items, nextBefore: versions.length > 20 ? items[items.length - 1].version : null };
  },

  async getVersion(userId: string, chapterId: string, versionId: string) {
    await getOwnedChapter(userId, chapterId);
    const revision = await prisma.documentVersion.findFirst({ where: { id: versionId, chapterId } });
    if (!revision) throw notFound("Revision");
    return revision;
  },

  async restoreVersion(userId: string, chapterId: string, versionId: string, version: number) {
    const revision = await chapterService.getVersion(userId, chapterId, versionId);
    // Restoring is a new edit, preserving the current draft and increasing OCC version.
    return chapterService.update(userId, chapterId, {
      version, title: revision.title,
      contentJson: (revision.contentJson ?? { type: "doc", content: [] }) as Record<string, unknown>,
    });
  },

  /**
   * Puts the book's chapters in a new order.
   *
   * The order must name every chapter exactly once, so a stale list from
   * another tab cannot drop or duplicate one. It is refused while a writing
   * job runs, because the job writes chapters in order.
   */
  async reorder(userId: string, bookId: string, chapterIds: string[]) {
    await getOwnedBook(userId, bookId);
    return prisma.$transaction(async (tx) => {
      await lockBook(tx, bookId, userId);
      await assertIdle(tx, bookId);
      const chapters = await tx.chapter.findMany({ where: { bookId }, select: { id: true } });
      const known = new Set(chapters.map((c) => c.id));
      if (chapterIds.length !== known.size || new Set(chapterIds).size !== chapterIds.length || chapterIds.some((id) => !known.has(id))) {
        throw conflict("The chapter list changed. Reload the editor and try again.");
      }
      // Positions are unique per book, so moving one chapter into another's
      // place would collide mid-way. Every chapter steps aside to a temporary
      // negative position first, then takes its final place.
      for (const [index, id] of chapterIds.entries()) {
        await tx.chapter.update({ where: { id }, data: { position: -(index + 1) } });
      }
      for (const [position, id] of chapterIds.entries()) {
        await tx.chapter.update({ where: { id }, data: { position } });
      }
      await tx.book.update({ where: { id: bookId }, data: { updatedAt: new Date() } });
      return tx.chapter.findMany({ where: { bookId }, orderBy: { position: "asc" }, select: { id: true, position: true, title: true } });
    });
  },

  /** AI writing assistant: returns a suggestion only — the client decides to accept or reject. */
  async assist(userId: string, input: { bookId: string; action: AssistAction; text: string; instruction?: string }, idempotencyKey?: string) {
    const book = await getOwnedBook(userId, input.bookId);
    if (input.action === "custom" && !input.instruction?.trim()) throw badRequest("Please describe what you want the AI to do.");

    const key = `assist:${userId}:${idempotencyKey || randomUUID()}`;
    await creditService.spend(userId, CREDIT_COSTS.assist, key, `AI assist: ${input.action}`, { rejectDuplicate: true });
    try {
      const { text, usage } = await aiService.assist(input.action, input.text, book.language, input.instruction);
      const doc = markdownToTiptap(text);
      return { text, content: doc.content ?? [], usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } };
    } catch (err) {
      await creditService.grant(userId, CREDIT_COSTS.assist, `refund:${key}`, "Refund: AI assist failed");
      throw err;
    }
  },
};
