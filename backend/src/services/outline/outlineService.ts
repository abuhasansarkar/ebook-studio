import { CREDIT_COSTS, outlineSchema, type Outline } from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { enqueueOutline } from "../../queues/index.js";
import { conflict, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { aiService } from "../ai/aiService.js";
import { ACTIVE_JOB_STATUSES, getBrief, getOwnedBook } from "../books/bookService.js";
import { creditService } from "../credits/creditService.js";

async function assertNoActiveJob(bookId: string) {
  const active = await prisma.generationJob.findFirst({ where: { bookId, status: { in: ACTIVE_JOB_STATUSES } } });
  if (active) throw conflict("A generation job is already running for this book.", { jobId: active.id });
}

async function assertNotWritten(bookId: string) {
  const written = await prisma.chapter.count({ where: { bookId, status: "done" } });
  if (written > 0) throw conflict("Chapters have already been written from this outline. Edit chapters in the editor instead.");
}

export const outlineService = {
  /** Queue an outline generation job (credits are reserved up front). */
  async requestGeneration(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    await assertNoActiveJob(bookId);
    await assertNotWritten(bookId);

    const cost = CREDIT_COSTS.outline;
    const job = await prisma.generationJob.create({
      data: { userId, bookId, type: "outline", total: 1, creditsReserved: cost },
    });
    try {
      await creditService.reserve(userId, cost, `job:${job.id}`);
    } catch (err) {
      await prisma.generationJob.delete({ where: { id: job.id } });
      throw err;
    }
    await enqueueOutline(job.id);
    return job;
  },

  /** Worker: generate and store a new outline version. Idempotent for terminal jobs. */
  async process(generationJobId: string) {
    const claimed = await prisma.generationJob.updateMany({
      where: { id: generationJobId, status: { in: ["queued", "running"] } },
      data: { status: "running", startedAt: new Date() },
    });
    if (claimed.count === 0) return; // cancelled or already finished
    const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: generationJobId } });

    try {
      const brief = await getBrief(job.bookId);
      const { outline, usage } = await aiService.generateOutline(brief);
      await prisma.$transaction(async (tx) => {
        const last = await tx.outline.findFirst({ where: { bookId: job.bookId }, orderBy: { version: "desc" } });
        await tx.outline.create({ data: { bookId: job.bookId, version: (last?.version ?? 0) + 1, data: outline } });
        await tx.book.update({
          where: { id: job.bookId },
          data: { title: outline.title, subtitle: outline.subtitle, status: "outline_ready" },
        });
        await tx.generationJob.update({
          where: { id: job.id },
          data: {
            status: "completed",
            progress: 1,
            finishedAt: new Date(),
            creditsCharged: job.creditsReserved,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            model: usage.model,
          },
        });
      });
      await creditService.settle(job.userId, job.creditsReserved, job.creditsReserved, `job:${job.id}`);
    } catch (err) {
      logger.error({ err, jobId: job.id }, "Outline generation failed");
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { status: "failed", finishedAt: new Date(), error: err instanceof Error ? err.message : String(err) },
      });
      await creditService.settle(job.userId, job.creditsReserved, 0, `job:${job.id}`);
    }
  },

  /** Save user edits as a new (unapproved) outline version. */
  async update(userId: string, bookId: string, data: Outline) {
    await getOwnedBook(userId, bookId);
    await assertNoActiveJob(bookId);
    await assertNotWritten(bookId);
    const outline = outlineSchema.parse(data);
    return prisma.$transaction(async (tx) => {
      const last = await tx.outline.findFirst({ where: { bookId }, orderBy: { version: "desc" } });
      const created = await tx.outline.create({ data: { bookId, version: (last?.version ?? 0) + 1, data: outline } });
      await tx.book.update({ where: { id: bookId }, data: { title: outline.title, subtitle: outline.subtitle, status: "outline_ready" } });
      return created;
    });
  },

  /** Approval gate: materialize chapters from the latest outline. */
  async approve(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    await assertNoActiveJob(bookId);
    await assertNotWritten(bookId);
    const latest = await prisma.outline.findFirst({ where: { bookId }, orderBy: { version: "desc" } });
    if (!latest) throw notFound("Outline");
    const outline = outlineSchema.parse(latest.data);

    return prisma.$transaction(async (tx) => {
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
