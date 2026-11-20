import { z } from "zod";

export const operationStateSchema = z.enum(["submitting", "queued", "running", "cancel_requested", "completed", "failed", "cancelled", "needs_review"]);
export type OperationState = z.infer<typeof operationStateSchema>;
export const operationSchema = z.object({
  id: z.string(), kind: z.string(), bookId: z.string().nullable(), resourceId: z.string().nullable(),
  state: operationStateSchema, progress: z.number().nonnegative(), total: z.number().nonnegative(),
  createdAt: z.string(), updatedAt: z.string(),
});
export type Operation = z.infer<typeof operationSchema>;
export const paginationSchema = z.object({
  cursor: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const apiErrorSchema = z.object({ error: z.object({
  code: z.string(), message: z.string(), details: z.unknown().optional(), requestId: z.string(),
}) });
