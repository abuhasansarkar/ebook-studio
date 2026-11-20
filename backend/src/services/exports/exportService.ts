import { assetService } from '../assets/assetService.js';
import { assertRuntimeAvailable } from "../runtime/readiness.js";
import { prisma } from "../../database/prisma.js";
import { enqueueExport } from "../../queues/index.js";
import { conflict, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { getLanguage, languageSupport, type BookDesign } from "@ebook/shared";
import { getOwnedBook } from "../books/bookService.js";
import { assertRenderable, buildBookDocument, documentDiagnostics } from "../design/bookDocument.js";
import { designService } from "../design/designService.js";
import { fontRegistry } from "../design/fonts.js";
import { storage } from "../storage/storage.js";
import { EXPORT_FONT_ORIGIN, renderBookHtml } from "./bookHtml.js";
import { renderPdf, textBlockWidth } from "./pdfRenderer.js";

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
    const book = await getOwnedBook(userId, bookId);
    await assertRuntimeAvailable();
    const support = languageSupport(book.language, await fontRegistry.available());
    if (support.level === "unavailable") throw conflict(`${getLanguage(book.language).name} cannot be typeset on this server: ${support.notes[0]}`, { code: "FONT_UNAVAILABLE" });
    const written = await prisma.chapter.count({ where: { bookId, OR: [{ wordCount: { gt: 0 } }, { status: "done" }] } });
    if (written === 0) throw conflict("Write at least one chapter before exporting.");
    const pending = await prisma.export.findFirst({ where: { bookId, status: { in: ["queued", "processing"] } } });
    if (pending) throw conflict("An export for this book is already in progress.", { exportId: pending.id });

    // The design is frozen at request time; later edits never change what a queued export renders.
    const design = await designService.get(userId, bookId);
    const exp = await prisma.export.create({ data: { userId, bookId, format, designVersion: design.version, designSnapshot: design.data } });
    await enqueueExport(exp.id);
    return exp;
  },

  async list(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    return prisma.export.findMany({ where: { bookId }, orderBy: { createdAt: "desc" }, take: 20, omit: { designSnapshot: true } });
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
      const design = exp.designSnapshot
        ? { version: exp.designVersion ?? 0, data: exp.designSnapshot as unknown as BookDesign }
        : await designService.get(exp.userId, exp.bookId);
      const doc = await buildBookDocument(exp.userId, exp.bookId, design);
      const support = await assertRenderable(doc);
      const checks = await documentDiagnostics(doc);
      const html = renderBookHtml(doc, {
        mode: "print",
        fontSrc: (id) => EXPORT_FONT_ORIGIN + id,
        images: await assetService.exportImages(exp.userId, doc.chapters.map((c) => c.content)),
        available: await fontRegistry.available(),
      });
      const { buffer, pageCount, foreignFonts, overflow, type3Fonts } = await renderPdf(html, { textBlockWidthIn: textBlockWidth(doc.design.data) });
      const diagnostics = { notes: support.notes, glyphs: checks.glyphs, foreignFonts, overflow, type3Fonts };
      const key = `exports/${exp.userId}/${exp.bookId}/${exp.id}.pdf`;
      await storage.put(key, buffer, "application/pdf");
      await prisma.export.update({
        where: { id: exp.id },
        data: { status: "ready", storageKey: key, fileSize: buffer.length, pageCount, diagnostics, finishedAt: new Date(), error: null },
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
