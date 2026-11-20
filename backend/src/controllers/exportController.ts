import { submitOperation } from "../services/operations/operationService.js";
import type { Request, Response } from "express";
import { z } from "zod";
import { userId } from "../middleware/requireAuth.js";
import { exportService, SUPPORTED_FORMATS } from "../services/exports/exportService.js";

export const createExportSchema = z.object({ format: z.enum(SUPPORTED_FORMATS).default("pdf") });

export const exportController = {
  async list(req: Request, res: Response) {
    res.json({ exports: await exportService.list(userId(req), String(req.params.bookId)) });
  },
  async create(req: Request, res: Response) {
    await submitOperation(req, res, userId(req), "export", String(req.params.bookId), async () => ({ status: 202, body: { export: await exportService.request(userId(req), String(req.params.bookId), req.body.format) } }));
  },
  async download(req: Request, res: Response) {
    const file = await exportService.getForDownload(userId(req), String(req.params.exportId));
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    if (file.size) res.setHeader("Content-Length", String(file.size));
    file.stream.on("error", () => res.destroy());
    file.stream.pipe(res);
  },
};
