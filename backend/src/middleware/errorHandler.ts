import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found`, requestId: String(req.id) } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details, requestId: String(req.id) } });
    return;
  }
  if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Upload exceeds the size limit.', requestId: String(req.id) } });
    return;
  }
  // Malformed JSON body
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Malformed JSON body", requestId: String(req.id) } });
    return;
  }
  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again.", requestId: String(req.id) } });
}
