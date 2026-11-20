import type { Request, Response } from "express";
import { bookBriefSchema, type BookBrief } from "@ebook/shared";
import { userId } from "../middleware/requireAuth.js";
import { prisma } from "../database/prisma.js";
import { bookService, getOwnedBook } from "../services/books/bookService.js";
import { outlineService } from "../services/outline/outlineService.js";
import { AppError, conflict } from "../utils/errors.js";

const param = (req: Request, name: string) => String(req.params[name]);

export const bookController = {
  async list(req: Request, res: Response) {
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : undefined;
    res.json({ books: await bookService.list(userId(req), { search }) });
  },

  /** Creates the book and immediately queues outline generation. */
  async create(req: Request, res: Response) {
    const uid = userId(req);
    const { brief, projectId } = req.body as { brief: BookBrief; projectId?: string };
    const book = await bookService.create(uid, brief, projectId);
    let job = null;
    let outlineError: { code: string; message: string } | null = null;
    try {
      job = await outlineService.requestGeneration(uid, book.id);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      outlineError = { code: err.code, message: err.message };
    }
    res.status(201).json({ book, job, outlineError });
  },

  async get(req: Request, res: Response) {
    res.json({ book: await bookService.get(userId(req), param(req, "bookId")) });
  },

  async remove(req: Request, res: Response) {
    await bookService.softDelete(userId(req), param(req, "bookId"));
    res.status(204).end();
  },

  /** Update the brief (only before any chapter is written). */
  async updateBrief(req: Request, res: Response) {
    const uid = userId(req);
    const bookId = param(req, "bookId");
    await getOwnedBook(uid, bookId);
    const written = await prisma.chapter.count({ where: { bookId, status: "done" } });
    if (written > 0) throw conflict("The brief can't be changed after chapters are written.");
    const brief = bookBriefSchema.parse(req.body);
    await prisma.$transaction([
      prisma.bookBrief.update({ where: { bookId }, data: { data: brief } }),
      prisma.book.update({ where: { id: bookId }, data: { language: brief.language, bookType: brief.bookType } }),
    ]);
    res.json({ brief });
  },

  async dashboard(req: Request, res: Response) {
    res.json(await bookService.dashboard(userId(req)));
  },
};
