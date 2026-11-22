import { z } from "zod";
import { badRequest } from "../utils/errors.js";
import type { Request, Response } from "express";
import { userId } from "../middleware/requireAuth.js";
import { chapterService } from "../services/editor/chapterService.js";
import { submitOperation } from "../services/operations/operationService.js";

export const chapterController = {
  async reorder(req: Request, res: Response) {
    res.json({ chapters: await chapterService.reorder(userId(req), String(req.params.bookId), req.body.chapterIds) });
  },
  async listForBook(req: Request, res: Response) {
    res.json({ chapters: await chapterService.listForBook(userId(req), String(req.params.bookId)) });
  },
  async get(req: Request, res: Response) {
    res.json({ chapter: await chapterService.get(userId(req), String(req.params.chapterId)) });
  },
  async update(req: Request, res: Response) {
    res.json({ chapter: await chapterService.update(userId(req), String(req.params.chapterId), req.body) });
  },
  async listVersions(req: Request, res: Response) {
    const parsed = z.coerce.number().int().min(0).optional().safeParse(req.query.before);
    if (!parsed.success) throw badRequest("before must be a non-negative integer.");
    const before = parsed.data;
    res.json(await chapterService.listVersions(userId(req), String(req.params.chapterId), before));
  },
  async getVersion(req: Request, res: Response) {
    res.json({ revision: await chapterService.getVersion(userId(req), String(req.params.chapterId), String(req.params.versionId)) });
  },
  async restoreVersion(req: Request, res: Response) {
    res.json({ chapter: await chapterService.restoreVersion(userId(req), String(req.params.chapterId), String(req.params.versionId), req.body.version) });
  },
  /**
   * AI writing assist.
   *
   * Recorded as an operation keyed by the request's Idempotency-Key: a retry
   * with the same key replays the stored suggestion instead of calling the AI
   * again, so a replayed key can never buy a second, uncharged AI call. Each
   * real execution is charged under its own ledger key. The operation is not
   * attached to the book (bookId null) so it stays out of the book's activity
   * list; the book's ownership is still checked by the assist itself.
   */
  async assist(req: Request, res: Response) {
    const uid = userId(req);
    await submitOperation(req, res, uid, "ai_assist", null, async () => ({
      status: 200,
      body: await chapterService.assist(uid, req.body),
    }));
  },
};
