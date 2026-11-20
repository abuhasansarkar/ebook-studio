import { submitOperation } from "../services/operations/operationService.js";
import type { Request, Response } from "express";
import type { Outline } from "@ebook/shared";
import { userId } from "../middleware/requireAuth.js";
import { outlineService } from "../services/outline/outlineService.js";

const bookId = (req: Request) => String(req.params.bookId);

export const outlineController = {
  async generate(req: Request, res: Response) {
    await submitOperation(req, res, userId(req), "outline", bookId(req), async () => ({ status: 202, body: { job: await outlineService.requestGeneration(userId(req), bookId(req)) } }));
  },
  async update(req: Request, res: Response) {
    res.json({ outline: await outlineService.update(userId(req), bookId(req), req.body as Outline, req.body.baseVersion) });
  },
  async approve(req: Request, res: Response) {
    res.json({ outline: await outlineService.approve(userId(req), bookId(req), req.body?.version) });
  },
};
