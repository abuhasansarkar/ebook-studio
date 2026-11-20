import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { badRequest } from "../utils/errors.js";

/** Validates and replaces `req.body` with the parsed value. */
export function validateBody(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      throw badRequest(
        "Validation failed",
        result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    req.body = result.data;
    next();
  };
}
