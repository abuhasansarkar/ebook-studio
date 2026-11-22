import { lockProject } from "./libraryService.js";
import { bookBriefSchema, type BookBrief } from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { notFound, forbidden } from "../../utils/errors.js";
import { entitlementHeadroom } from "../billing/entitlements.js";

export const ACTIVE_JOB_STATUSES = ["queued", "running"];

/** Loads a book owned by the user, or throws 404 (never reveals other users' books). */
export async function getOwnedBook(userId: string, bookId: string) {
  const book = await prisma.book.findFirst({ where: { id: bookId, userId, deletedAt: null } });
  if (!book) throw notFound("Book");
  return book;
}

export async function getBrief(bookId: string): Promise<BookBrief> {
  const row = await prisma.bookBrief.findUniqueOrThrow({ where: { bookId } });
  return bookBriefSchema.parse(row.data);
}

export const bookService = {
  async create(userId: string, brief: BookBrief, projectId?: string | null) {
    // The book count is a paid quota. A plan that carries `maxBooks: 5`
    // allows five live books; the sixth is refused rather than silently
    // allowed. The count excludes archived and deleted books, so archiving
    // frees a slot, and the check is on the server so a direct API call is
    // subject to it too.
    const headroom = await entitlementHeadroom(userId, "maxBooks");
    if (headroom !== null) {
      const live = await prisma.book.count({ where: { userId, deletedAt: null, archivedAt: null } });
      if (live >= headroom) {
        throw forbidden(
          `This plan includes ${headroom} ${headroom === 1 ? "book" : "books"}. Archive or delete a book, or upgrade your plan to add more.`,
          { entitlement: "maxBooks", limit: headroom, used: live },
        );
      }
    }
    return prisma.$transaction(async tx => {
      if (projectId) await lockProject(tx, userId, projectId, true);
      return tx.book.create({ data: { userId, projectId: projectId ?? null, title: brief.title || 'Untitled book', language: brief.language, bookType: brief.bookType, brief: { create: { data: brief } } } });
    });
  },

  async list(userId: string, opts: { search?: string; take?: number }) {
    const books = await prisma.book.findMany({
      where: {
        userId,
        deletedAt: null,
        archivedAt: null,
        ...(opts.search ? { title: { contains: opts.search, mode: "insensitive" as const } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: Math.min(opts.take ?? 100, 200),
      include: {
        _count: { select: { chapters: true } },
        coverDesigns: { orderBy: { version: "desc" }, take: 1, select: { version: true, data: true } },
        coloringPages: { where: { status: "completed", assetId: { not: null } }, select: { assetId: true }, take: 1 },
      },
    });
    const wordSums = await prisma.chapter.groupBy({
      by: ["bookId"],
      where: { bookId: { in: books.map((b) => b.id) } },
      _sum: { wordCount: true },
    });
    const words = new Map(wordSums.map((w) => [w.bookId, w._sum.wordCount ?? 0]));
    return books.map(({ _count, coverDesigns, coloringPages, ...b }) => {
      const latestCover = coverDesigns?.[0];
      const coverData = latestCover?.data as { artworkId?: string | null } | undefined;
      const coverArtworkId = coverData?.artworkId ?? coloringPages?.[0]?.assetId ?? null;
      return {
        ...b,
        chapterCount: _count.chapters,
        wordCount: words.get(b.id) ?? 0,
        coverArtworkId,
        coverVersion: latestCover?.version ?? null,
      };
    });
  },

  async get(userId: string, bookId: string) {
    const book = await getOwnedBook(userId, bookId);
    const [brief, outline, chapters, activeJob, lastJob] = await Promise.all([
      getBrief(bookId),
      prisma.outline.findFirst({ where: { bookId }, orderBy: { version: "desc" } }),
      prisma.chapter.findMany({
        where: { bookId },
        orderBy: { position: "asc" },
        select: { id: true, position: true, title: true, goal: true, status: true, wordCount: true, targetWords: true, version: true, updatedAt: true },
      }),
      prisma.generationJob.findFirst({ where: { bookId, status: { in: ACTIVE_JOB_STATUSES } }, orderBy: { createdAt: "desc" } }),
      prisma.generationJob.findFirst({ where: { bookId }, orderBy: { createdAt: "desc" } }),
    ]);
    const publicJob = async (job: typeof activeJob) => {
      if (!job) return null;
      const { inputSnapshot: _snapshot, leaseToken: _token, ...visible } = job;
      const savedSections = await prisma.generationSection.count({ where: { jobId: job.id, kind: 'section' } });
      return { ...visible, savedSections, recovering: job.status === 'running' && !!job.leaseExpiresAt && job.leaseExpiresAt.getTime() <= Date.now() };
    };
    return { ...book, brief, outline, chapters, activeJob: await publicJob(activeJob), lastJob: await publicJob(lastJob) };
  },

  async softDelete(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    // Stop any running AI work; the worker finalizes the job and returns unused credits.
    await prisma.$transaction([
      prisma.generationJob.updateMany({ where: { bookId, status: { in: ACTIVE_JOB_STATUSES } }, data: { cancelRequested: true } }),
      prisma.book.update({ where: { id: bookId }, data: { deletedAt: new Date() } }),
    ]);
  },

  async dashboard(userId: string) {
    const [bookCount, chapterAgg, wallet, recent] = await Promise.all([
      prisma.book.count({ where: { userId, deletedAt: null, archivedAt: null } }),
      prisma.chapter.aggregate({
        where: { book: { userId, deletedAt: null, archivedAt: null }, status: "done" },
        _count: { _all: true },
        _sum: { wordCount: true },
      }),
      prisma.creditWallet.upsert({ where: { userId }, create: { userId }, update: {} }),
      this.list(userId, { take: 6 }),
    ]);
    return {
      totals: { books: bookCount, chapters: chapterAgg._count._all, words: chapterAgg._sum.wordCount ?? 0 },
      credits: { balance: wallet.balance, reserved: wallet.reserved },
      recentBooks: recent,
    };
  },
};
