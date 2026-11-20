import type { Request, Response } from "express";
import { userId } from "../middleware/requireAuth.js";
import { generationService } from "../services/generation/generationService.js";

export const generationController = {
  async start(req: Request, res: Response) {
    res.status(202).json({ job: await generationService.start(userId(req), String(req.params.bookId)) });
  },
  async cancel(req: Request, res: Response) {
    res.json({ job: await generationService.cancel(userId(req), String(req.params.bookId)) });
  },
  async getJob(req: Request, res: Response) {
    res.json({ job: await generationService.getJob(userId(req), String(req.params.jobId)) });
  },
};
