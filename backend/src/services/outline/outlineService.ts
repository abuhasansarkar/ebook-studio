import { assertRuntimeAvailable } from "../runtime/readiness.js";
import { CREDIT_COSTS, bookBriefSchema, outlineSchema, type Outline } from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { dispatchPending, persistDispatch } from "../../queues/index.js";
import { conflict, customerJobError, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { aiService } from "../ai/aiService.js";
import { assertChapterQuota, hasEntitlement } from "../billing/entitlements.js";
import { getOwnedBook } from "../books/bookService.js";
import { reserveInTransaction, type Tx } from "../credits/creditService.js";
import { assertIdle, claimJob, fence, finishJob, finishOwned, GenerationCancelled, heartbeat, LeaseLost, lockBook } from "../generation/jobRuntime.js";

async function assertNotWritten(tx: Tx, bookId: string) {
  if (await tx.chapter.count({ where: { bookId, OR: [{ status: "done" }, { version: { gt: 0 } }, { wordCount: { gt: 0 } }] } })) throw conflict("Chapters have already been written from this outline. Edit chapters in the editor instead.");
}

export const outlineService = {
  /** Queue an outline generation job (credits are reserved up front). */
  async requestGeneration(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    await assertRuntimeAvailable();
    // A plan with the `priorityJobs` entitlement puts its work ahead of
    // ordinary work in the queue.
    const paid = await hasEntitlement(userId, 'priorityJobs');
    const job = await prisma.$transaction(async tx => {
      await lockBook(tx, bookId, userId);
      await assertIdle(tx, bookId);
      await assertNotWritten(tx, bookId);
      const brief = bookBriefSchema.parse((await tx.bookBrief.findUniqueOrThrow({ where: { bookId } })).data);
      const created = await tx.generationJob.create({ data: { userId, bookId, type: 'outline', total: 1, creditsReserved: CREDIT_COSTS.outline, inputSnapshot: { schema: 1, brief } } });
      await reserveInTransaction(tx, userId, CREDIT_COSTS.outline, `job:${created.id}`);
      await persistDispatch(tx, 'outline', created.id, paid);
      return created;
    });
    await dispatchPending().catch(() => undefined);
    const { inputSnapshot: _snapshot, leaseToken: _token, ...publicJob } = job;
    return publicJob;
  },

  async process(generationJobId: string) {
    const token = await claimJob(generationJobId);
    if (!token) return;
    const stop = heartbeat(generationJobId, token);
    try {
      const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: generationJobId } });
      const snapshot = job.inputSnapshot as { schema?: number; brief?: unknown } | null;
      if (snapshot?.schema !== 1) throw new Error('Legacy job has no input snapshot. Cancel and restart generation.');
      await prisma.$transaction(tx => fence(tx, job.id, token));
      const { outline, usage } = await aiService.generateOutline(bookBriefSchema.parse(snapshot.brief));
      await prisma.$transaction(async tx => {
        await fence(tx, job.id, token);
        const last = await tx.outline.findFirst({ where: { bookId: job.bookId }, orderBy: { version: 'desc' } });
        await tx.outline.create({ data: { bookId: job.bookId, version: (last?.version ?? 0) + 1, data: outline } });
        await tx.book.update({ where: { id: job.bookId }, data: { title: outline.title, subtitle: outline.subtitle, status: 'outline_ready' } });
        await tx.generationJob.update({ where: { id: job.id }, data: { progress: 1, creditsCharged: job.creditsReserved, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, model: usage.model } });
        await finishJob(tx, job.id, 'completed');
      });
    } catch (err) {
      if (err instanceof LeaseLost) return;
      const cancelled = err instanceof GenerationCancelled;
      if (!cancelled) logger.error({ err, jobId: generationJobId }, 'Outline generation failed');
      try { await finishOwned(generationJobId, token, cancelled ? 'cancelled' : 'failed', cancelled ? undefined : customerJobError(err, 'The AI planner did not return a usable outline. Try generating it again.')); }
      catch (finishError) { if (!(finishError instanceof LeaseLost)) throw finishError; }
    } finally { stop(); }
  },

  async history(userId: string, bookId: string, before?: number) {
    await getOwnedBook(userId, bookId);
    const rows = await prisma.outline.findMany({ where: { bookId, ...(before ? { version: { lt: before } } : {}) }, orderBy: { version: 'desc' }, take: 21, select: { id: true, version: true, approvedAt: true, createdAt: true } });
    return { versions: rows.slice(0, 20), nextBefore: rows.length > 20 ? rows[19].version : null };
  },
  async detail(userId: string, bookId: string, version: number) {
    await getOwnedBook(userId, bookId);
    const outline = await prisma.outline.findFirst({ where: { bookId, version } });
    if (!outline) throw notFound('Outline');
    return outline;
  },
  async restore(userId: string, bookId: string, version: number, baseVersion: number) {
    return prisma.$transaction(async tx => {
      await lockBook(tx, bookId, userId);
      await assertIdle(tx, bookId);
      const current = await tx.outline.findFirst({ where: { bookId }, orderBy: { version: 'desc' } });
      if (current?.version !== baseVersion) throw conflict('The outline changed. Reload history before restoring.');
      const source = await tx.outline.findFirst({ where: { bookId, version } });
      if (!source) throw notFound('Outline');
      const restored = await tx.outline.create({ data: { bookId, version: current.version + 1, data: outlineSchema.parse(source.data) } });
      // Restoring planning never deletes/reorders/renames manuscript chapters.
      await tx.book.update({ where: { id: bookId }, data: { updatedAt: new Date() } });
      return restored;
    });
  },

  /** Save user edits as a new (unapproved) outline version. */
  async update(userId: string, bookId: string, data: Outline, baseVersion: number) {
    await getOwnedBook(userId, bookId);
    const outline = outlineSchema.parse(data);
    return prisma.$transaction(async (tx) => {
      await lockBook(tx, bookId, userId);
      await assertIdle(tx, bookId);
      await assertNotWritten(tx, bookId);
      const last = await tx.outline.findFirst({ where: { bookId }, orderBy: { version: "desc" } });
      if (baseVersion !== (last?.version ?? 0)) throw conflict("The outline changed. Reload before saving.");
      const created = await tx.outline.create({ data: { bookId, version: (last?.version ?? 0) + 1, data: outline } });
      await tx.book.update({ where: { id: bookId }, data: { title: outline.title, subtitle: outline.subtitle, status: "outline_ready" } });
      return created;
    });
  },

  /** Approval gate: materialize chapters from the latest outline. */
  async approve(userId: string, bookId: string, version: number) {
    await getOwnedBook(userId, bookId);
    // The chapter count is a paid quota. The outline is checked before the
    // transaction so a refusal leaves no partial write behind.
    await assertChapterQuota(userId, bookId, undefined);
    return prisma.$transaction(async (tx) => {
      await lockBook(tx, bookId, userId);
      await assertIdle(tx, bookId);
      const latest = await tx.outline.findFirst({ where: { bookId }, orderBy: { version: 'desc' } });
      if (!latest) throw notFound('Outline');
      if (latest.version !== version) throw conflict('The outline changed. Review the latest version before approval.');
      if (latest.approvedAt) return latest;
      await assertNotWritten(tx, bookId);
      const outline = outlineSchema.parse(latest.data);
      await assertChapterQuota(userId, bookId, outline.chapters.length, tx);
      await tx.chapter.deleteMany({ where: { bookId } });
      await tx.chapter.createMany({
        data: outline.chapters.map((c, i) => ({
          bookId,
          position: i,
          title: c.title,
          goal: c.goal,
          keyPoints: c.keyPoints,
          targetWords: c.targetWords,
        })),
      });
      await tx.book.update({ where: { id: bookId }, data: { title: outline.title, subtitle: outline.subtitle, status: "outline_ready" } });
      return tx.outline.update({ where: { id: latest.id }, data: { approvedAt: new Date() } });
    });
  },
};
