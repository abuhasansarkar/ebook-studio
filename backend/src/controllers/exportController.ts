import { submitOperation } from "../services/operations/operationService.js";
import type { Request, Response } from "express";
import { z } from "zod";
import { userId } from "../middleware/requireAuth.js";
import { exportService, exportFormatOptions, SUPPORTED_FORMATS } from "../services/exports/exportService.js";
import { exportRequestSchema } from "@ebook/shared";

/**
 * The request body accepts a format and that format's options.
 *
 * The options are validated against the format's own schema, so an EPUB option
 * can never be sent for a PDF export.
 */
export const createExportSchema = z
  .object({
    format: z.enum(SUPPORTED_FORMATS).default("pdf"),
    options: z.unknown().optional(),
  })
  .superRefine((value, ctx) => {
    const result = exportRequestSchema.safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ code: "custom", path: ["options", ...issue.path], message: issue.message });
      }
    }
  });

export const exportController = {
  async list(req: Request, res: Response) {
    res.json({ exports: await exportService.list(userId(req), String(req.params.bookId)) });
  },
  /** The formats this server can produce and the options each accepts. */
  async formats(_req: Request, res: Response) {
    res.json({ formats: exportFormatOptions() });
  },
  async create(req: Request, res: Response) {
    await submitOperation(req, res, userId(req), "export", String(req.params.bookId), async () => ({
      status: 202,
      body: { export: await exportService.request(userId(req), String(req.params.bookId), req.body.format, req.body.options) },
    }));
  },
  /** One export with its snapshot and validation summary. */
  async detail(req: Request, res: Response) {
    const exp = await exportService.get(userId(req), String(req.params.exportId));
    res.json({ export: exp });
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
