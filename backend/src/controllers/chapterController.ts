import { z } from "zod";
import { badRequest } from "../utils/errors.js";
import type { Request, Response } from "express";
import { userId } from "../middleware/requireAuth.js";
import { chapterService } from "../services/editor/chapterService.js";

export const chapterController = {
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
  async assist(req: Request, res: Response) {
    const key = req.header("Idempotency-Key")?.slice(0, 100);
    res.json(await chapterService.assist(userId(req), req.body, key));
  },
};
