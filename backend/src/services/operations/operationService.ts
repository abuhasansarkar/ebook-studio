import { createHash, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Operation as OperationView } from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import type { Operation } from "../../generated/prisma/client.js";
import { logger } from "../../utils/logger.js";
import { AppError, badRequest, conflict, notFound } from "../../utils/errors.js";
import { getOwnedBook } from "../books/bookService.js";

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

interface Result { status: number; body: Record<string, unknown> }

/** A submission still marked in flight after this long is treated as abandoned. */
const STALE_SUBMISSION_MS = 120_000;

export async function submitOperation(req: Request, res: Response, userId: string, kind: string, bookId: string | null, run: () => Promise<Result>) {
  const idempotencyKey = req.get("Idempotency-Key") ?? randomUUID();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(idempotencyKey)) throw badRequest("Idempotency-Key must contain 1–100 letters, numbers, underscores or hyphens.");
  if (bookId) await getOwnedBook(userId, bookId);
  const requestHash = createHash("sha256").update(canonicalJson({ kind, bookId, input: req.body })).digest("hex");
  let operation: Operation;
  try {
    operation = await prisma.operation.create({ data: { userId, idempotencyKey, requestHash, kind, bookId } });
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    const existing = await prisma.operation.findUniqueOrThrow({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
    logger.info({ requestId: String(req.id), operationId: existing.id, kind }, "Operation request replay");
    if (existing.requestHash !== requestHash) throw conflict("This request key has already been used with different inputs.", { operationId: existing.id });
    if (existing.bookId) await getOwnedBook(userId, existing.bookId);
    res.setHeader("X-Operation-Id", existing.id);
    if (existing.responseBody && existing.responseStatus) {
      const body = existing.responseBody as Record<string, unknown>;
      const error = body.error as Record<string, unknown> | undefined;
      res.status(existing.responseStatus).json({ ...body, ...(error ? { error: { ...error, requestId: String(req.id) } } : {}), operationId: existing.id, replayed: true });
      return;
    }
    // If the earlier attempt is still actively submitting, wait briefly for it to finish
    // rather than instantly throwing 409 to a replaying client.
    let current = existing;
    const waitStart = Date.now();
    while (current.state === "submitting" && !current.responseBody && Date.now() - waitStart < 20_000) {
      if (req.destroyed || res.writableEnded) return;
      await new Promise(r => setTimeout(r, 1000));
      const fresh = await prisma.operation.findUnique({ where: { id: existing.id } });
      if (!fresh) break;
      current = fresh;
    }
    if (current.responseBody && current.responseStatus) {
      const body = current.responseBody as Record<string, unknown>;
      const error = body.error as Record<string, unknown> | undefined;
      res.status(current.responseStatus).json({ ...body, ...(error ? { error: { ...error, requestId: String(req.id) } } : {}), operationId: current.id, replayed: true });
      return;
    }
    // The earlier attempt either crashed or was abandoned mid-flight. It is
    // never re-run automatically, because it may have partly taken effect, but
    // the key is released: the caller is told to check, and their next attempt
    // is a new request rather than an endless wait on this one.
    const abandoned = current.state === "submitting" && Date.now() - current.updatedAt.getTime() > STALE_SUBMISSION_MS;
    if (current.state === "needs_review" || abandoned) {
      throw new AppError(409, "OPERATION_NEEDS_REVIEW", "Your earlier attempt didn't finish because of a server error. Check whether it took effect before trying again; the next attempt starts fresh.", { operationId: current.id });
    }
    throw new AppError(409, "OPERATION_PENDING", "The earlier request is still being checked. Retry with the same request key; do not start a duplicate.", { operationId: current.id });
  }
  logger.info({ requestId: String(req.id), operationId: operation.id, kind }, "Operation request recorded");
  res.setHeader("X-Operation-Id", operation.id);
  try {
    const result = await run();
    const body = result.body as { job?: { id: string }; export?: { id: string }; book?: { id: string } };
    await prisma.operation.update({ where: { id: operation.id }, data: {
      state: "submitted", responseStatus: result.status, responseBody: result.body as object,
      bookId: body.book?.id ?? bookId, resourceId: body.job?.id ?? body.export?.id ?? null,
    } });
    res.status(result.status).json({ ...result.body, operationId: operation.id });
  } catch (err) {
    if (err instanceof AppError && err.status < 500) {
      const body = { error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } };
      await prisma.operation.update({ where: { id: operation.id }, data: { state: "failed", responseStatus: err.status, responseBody: body as object } });
      throw err;
    }
    // A crash or uncertain failure must never be silently re-executed: domain
    // reconciliation/checkpoint recovery is implemented separately in S03.
    await prisma.operation.update({ where: { id: operation.id }, data: { state: "needs_review" } }).catch(() => undefined);
    throw err;
  }
}

async function project(record: Operation): Promise<OperationView> {
  let state: OperationView["state"] = record.state === "submitted" ? "completed" : record.state as OperationView["state"];
  let progress = 0;
  let total = 0;
  let updatedAt = record.updatedAt;
  if (record.state === "submitting" && Date.now() - record.updatedAt.getTime() > STALE_SUBMISSION_MS) state = "needs_review";
  if (record.kind === "create_book" && (record.responseBody as { outlineError?: unknown } | null)?.outlineError) state = "failed";
  if (record.resourceId && record.state === "submitted") {
    if (record.kind === "export") {
      const exp = await prisma.export.findFirst({ where: { id: record.resourceId, userId: record.userId } });
      if (exp) { state = exp.status === "ready" ? "completed" : exp.status === "processing" ? "running" : exp.status as "queued" | "failed"; total = 1; progress = state === "completed" ? 1 : 0; updatedAt = exp.finishedAt ?? record.updatedAt; }
      else state = "needs_review";
    } else {
      const job = await prisma.generationJob.findFirst({ where: { id: record.resourceId, userId: record.userId } });
      if (job) { state = job.cancelRequested && ["queued", "running"].includes(job.status) ? "cancel_requested" : job.status as OperationView["state"]; progress = job.progress; total = job.total; updatedAt = job.updatedAt; }
      else state = "needs_review";
    }
  }
  return { id: record.id, kind: record.kind, bookId: record.bookId, resourceId: record.resourceId, state, progress, total, createdAt: record.createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
}

export const operationService = {
  async get(userId: string, id: string) {
    const record = await prisma.operation.findFirst({ where: { id, userId } });
    if (!record) throw notFound("Operation");
    if (record.bookId) await getOwnedBook(userId, record.bookId);
    return project(record);
  },
  async list(userId: string, bookId: string, limit: number, cursor?: string) {
    await getOwnedBook(userId, bookId);
    if (cursor && !await prisma.operation.findFirst({ where: { id: cursor, userId, bookId } })) throw notFound("Cursor");
    const rows = await prisma.operation.findMany({ where: { userId, bookId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    return { operations: await Promise.all(rows.slice(0, limit).map(project)), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
  },
};
