import { assetService } from '../assets/assetService.js';
import { assertRuntimeAvailable } from "../runtime/readiness.js";
import { prisma } from "../../database/prisma.js";
import { enqueueExport } from "../../queues/index.js";
import { conflict, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { getBrief, getOwnedBook } from "../books/bookService.js";
import { storage } from "../storage/storage.js";
import { buildBookHtml } from "./bookHtml.js";
import { renderPdf } from "./pdfRenderer.js";

export const SUPPORTED_FORMATS = ["pdf"] as const;

function slugify(s: string) {
  const slug = s
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return slug || "ebook";
}

export const exportService = {
  async request(userId: string, bookId: string, format: "pdf") {
    await getOwnedBook(userId, bookId);
    await assertRuntimeAvailable();
    const written = await prisma.chapter.count({ where: { bookId, OR: [{ wordCount: { gt: 0 } }, { status: "done" }] } });
    if (written === 0) throw conflict("Write at least one chapter before exporting.");
    const pending = await prisma.export.findFirst({ where: { bookId, status: { in: ["queued", "processing"] } } });
    if (pending) throw conflict("An export for this book is already in progress.", { exportId: pending.id });

    const exp = await prisma.export.create({ data: { userId, bookId, format } });
    await enqueueExport(exp.id);
    return exp;
  },

  async list(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    return prisma.export.findMany({ where: { bookId }, orderBy: { createdAt: "desc" }, take: 20 });
  },

  async getForDownload(userId: string, exportId: string) {
    const exp = await prisma.export.findFirst({
      where: { id: exportId, userId, book: { deletedAt: null } },
      include: { book: { select: { title: true } } },
    });
    if (!exp) throw notFound("Export");
    if (exp.status !== "ready" || !exp.storageKey) throw conflict("This export is not ready yet.");
    const { stream, size } = await storage.getStream(exp.storageKey);
    return { stream, size, filename: `${slugify(exp.book.title)}.${exp.format}`, contentType: "application/pdf" };
  },

  /** Worker: render, validate, store. */
  async process(exportId: string) {
    const claimed = await prisma.export.updateMany({ where: { id: exportId, status: { in: ["queued", "processing"] } }, data: { status: "processing" } });
    if (claimed.count === 0) return;
    const exp = await prisma.export.findUniqueOrThrow({ where: { id: exportId } });
    try {
      const [book, chapters, brief] = await Promise.all([
        prisma.book.findUniqueOrThrow({ where: { id: exp.bookId } }),
        prisma.chapter.findMany({ where: { bookId: exp.bookId, OR: [{ wordCount: { gt: 0 } }, { status: "done" }] }, orderBy: { position: "asc" } }),
        getBrief(exp.bookId),
      ]);
      const html = buildBookHtml({
        images: await assetService.exportImages(exp.userId, chapters.map(c => c.contentJson)),
        title: book.title,
        subtitle: book.subtitle,
        authorName: brief.authorName || undefined,
        language: book.language,
        chapters: chapters.map((c) => ({ title: c.title, contentJson: c.contentJson })),
      });
      const { buffer, pageCount } = await renderPdf(html);
      const key = `exports/${exp.userId}/${exp.bookId}/${exp.id}.pdf`;
      await storage.put(key, buffer, "application/pdf");
      await prisma.export.update({
        where: { id: exp.id },
        data: { status: "ready", storageKey: key, fileSize: buffer.length, pageCount, finishedAt: new Date(), error: null },
      });
    } catch (err) {
      logger.error({ err, exportId }, "Export failed");
      await prisma.export.update({
        where: { id: exp.id },
        data: { status: "failed", finishedAt: new Date(), error: (err instanceof Error ? err.message : String(err)).slice(0, 500) },
      });
    }
  },
};
