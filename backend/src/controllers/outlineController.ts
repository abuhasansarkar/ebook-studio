import type { Request, Response } from "express";
import type { Outline } from "@ebook/shared";
import { userId } from "../middleware/requireAuth.js";
import { outlineService } from "../services/outline/outlineService.js";

const bookId = (req: Request) => String(req.params.bookId);

export const outlineController = {
  async generate(req: Request, res: Response) {
    res.status(202).json({ job: await outlineService.requestGeneration(userId(req), bookId(req)) });
  },
  async update(req: Request, res: Response) {
    res.json({ outline: await outlineService.update(userId(req), bookId(req), req.body as Outline) });
  },
  async approve(req: Request, res: Response) {
    res.json({ outline: await outlineService.approve(userId(req), bookId(req)) });
  },
};
