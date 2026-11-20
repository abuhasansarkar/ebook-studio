import { chapterCredits, type BookBrief } from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { enqueueChapters, getQueues } from "../../queues/index.js";
import { conflict, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { aiService } from "../ai/aiService.js";
import { ACTIVE_JOB_STATUSES, getBrief, getOwnedBook } from "../books/bookService.js";
import { creditService } from "../credits/creditService.js";
import { countWords, markdownToTiptap } from "../editor/markdownToTiptap.js";
type FinalStatus = "completed" | "failed" | "cancelled";

async function finalize(jobId: string, status: FinalStatus, error?: string) {
  await prisma.generationJob.update({
    where: { id: jobId },
    data: { status, finishedAt: new Date(), error: error ?? null },
  });
  await settleJob(jobId);
}

/** Settle credits and sync book/chapter status for a job already in a terminal state. Idempotent. */
async function settleJob(jobId: string) {
  const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } });
  const status = job.status;
  await creditService.settle(job.userId, job.creditsReserved, job.creditsCharged, `job:${job.id}`);
  if (job.type !== "chapters") return;

  const remaining = await prisma.chapter.count({ where: { bookId: job.bookId, status: { not: "done" } } });
  const bookStatus = remaining === 0 ? "written" : status === "failed" ? "failed" : "outline_ready";
  await prisma.book.update({ where: { id: job.bookId }, data: { status: bookStatus } });
  // Chapters left mid-generation by a cancel go back to pending.
  await prisma.chapter.updateMany({ where: { bookId: job.bookId, status: "generating" }, data: { status: "pending" } });
}

async function writeChapter(brief: BookBrief, bookId: string, chapterId: string, jobId: string) {
  const [book, chapters] = await Promise.all([
    prisma.book.findUniqueOrThrow({ where: { id: bookId } }),
    prisma.chapter.findMany({ where: { bookId }, orderBy: { position: "asc" } }),
  ]);
  const chapter = chapters.find((c) => c.id === chapterId);
  if (!chapter) throw notFound("Chapter");

  const keyPoints = (Array.isArray(chapter.keyPoints) ? chapter.keyPoints : []).filter((k): k is string => typeof k === "string" && k.trim().length > 0);
  const sections = keyPoints.length ? keyPoints : [chapter.title];
  const wordsPerSection = Math.max(150, Math.round(chapter.targetWords / sections.length));
  const previousSummaries = chapters.filter((c) => c.position < chapter.position).map((c) => c.summary ?? c.goal);

  let markdown = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let model = "";

  for (let s = 0; s < sections.length; s++) {
    // Honor cancellation between sections.
    const live = await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId }, select: { cancelRequested: true } });
    if (live.cancelRequested) return { cancelled: true as const };

    const { text, usage } = await aiService.writeSection({
      brief,
      bookTitle: book.title,
      allChapterTitles: chapters.map((c) => c.title),
      chapter: { title: chapter.title, goal: chapter.goal, keyPoints: sections },
      chapterIndex: chapter.position,
      previousSummaries,
      sectionTopic: sections[s],
      sectionIndex: s,
      sectionCount: sections.length,
      writtenSoFar: markdown,
      targetWords: wordsPerSection,
    });
    markdown += (markdown ? "\n\n" : "") + text;
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    model = usage.model;
  }

  const summary = await aiService.summarizeChapter(chapter.title, markdown, brief.language);
  inputTokens += summary.usage.inputTokens;
  outputTokens += summary.usage.outputTokens;

  const contentJson = markdownToTiptap(markdown);
  const credits = chapterCredits(chapter.targetWords);

  // Chapter save + progress + credit usage are one atomic step (restart-safe).
  await prisma.$transaction([
    prisma.chapter.update({
      where: { id: chapter.id },
      data: {
        status: "done",
        contentJson: contentJson as object,
        summary: summary.text,
        wordCount: countWords(markdown),
        version: { increment: 1 },
        error: null,
      },
    }),
    prisma.generationJob.update({
      where: { id: jobId },
      data: {
        progress: { increment: 1 },
        creditsCharged: { increment: credits },
        inputTokens: { increment: inputTokens },
        outputTokens: { increment: outputTokens },
        model,
      },
    }),
  ]);
  return { cancelled: false as const };
}

export const generationService = {
  /** Start (or retry) writing every chapter that is not yet done. */
  async start(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    const active = await prisma.generationJob.findFirst({ where: { bookId, status: { in: ACTIVE_JOB_STATUSES } } });
    if (active) throw conflict("Generation is already running for this book.", { jobId: active.id });

    const outline = await prisma.outline.findFirst({ where: { bookId }, orderBy: { version: "desc" } });
    if (!outline?.approvedAt) throw conflict("Approve the outline before generating chapters.");

    const pending = await prisma.chapter.findMany({ where: { bookId, status: { not: "done" } }, orderBy: { position: "asc" } });
    if (pending.length === 0) throw conflict("All chapters are already written.");

    const cost = pending.reduce((sum, c) => sum + chapterCredits(c.targetWords), 0);
    const job = await prisma.generationJob.create({
      data: { userId, bookId, type: "chapters", total: pending.length, creditsReserved: cost },
    });
    try {
      await creditService.reserve(userId, cost, `job:${job.id}`);
    } catch (err) {
      await prisma.generationJob.delete({ where: { id: job.id } });
      throw err;
    }
    await prisma.$transaction([
      prisma.chapter.updateMany({ where: { bookId, status: "failed" }, data: { status: "pending", error: null } }),
      prisma.book.update({ where: { id: bookId }, data: { status: "generating" } }),
    ]);
    await enqueueChapters(job.id);
    return job;
  },

  async cancel(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    const job = await prisma.generationJob.findFirst({ where: { bookId, status: { in: ACTIVE_JOB_STATUSES } }, orderBy: { createdAt: "desc" } });
    if (!job) throw conflict("There is no running generation to cancel.");

    // If it has not started yet, cancel it directly (works even when no worker is running).
    // Workers only claim queued/running jobs, so moving straight to "cancelled" is race-free.
    const claimed = await prisma.generationJob.updateMany({
      where: { id: job.id, status: "queued" },
      data: { cancelRequested: true, status: "cancelled", finishedAt: new Date() },
    });
    if (claimed.count === 1) {
      const queue = job.type === "outline" ? getQueues().outline : getQueues().chapters;
      await queue.remove(job.id).catch(() => undefined);
      await settleJob(job.id);
    } else {
      await prisma.generationJob.update({ where: { id: job.id }, data: { cancelRequested: true } });
    }
    return prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
  },

  async getJob(userId: string, jobId: string) {
    const job = await prisma.generationJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw notFound("Job");
    return job;
  },

  /**
   * Worker: write chapters one section at a time. Restart-safe — completed chapters
   * are skipped, so a re-run after a crash never duplicates content or charges.
   */
  async process(generationJobId: string) {
    const claimed = await prisma.generationJob.updateMany({
      where: { id: generationJobId, status: { in: ["queued", "running"] } },
      data: { status: "running", startedAt: new Date() },
    });
    if (claimed.count === 0) return;
    const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: generationJobId } });
    const brief = await getBrief(job.bookId);

    let currentChapterId: string | null = null;
    try {
      for (;;) {
        const live = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id }, select: { cancelRequested: true } });
        if (live.cancelRequested) return finalize(job.id, "cancelled");

        const next = await prisma.chapter.findFirst({ where: { bookId: job.bookId, status: { not: "done" } }, orderBy: { position: "asc" } });
        if (!next) return finalize(job.id, "completed");

        currentChapterId = next.id;
        await prisma.chapter.update({ where: { id: next.id }, data: { status: "generating", error: null } });
        const res = await writeChapter(brief, job.bookId, next.id, job.id);
        if (res.cancelled) return finalize(job.id, "cancelled");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, jobId: job.id, chapterId: currentChapterId }, "Chapter generation failed");
      if (currentChapterId) {
        await prisma.chapter.update({ where: { id: currentChapterId }, data: { status: "failed", error: message.slice(0, 500) } });
      }
      return finalize(job.id, "failed", message.slice(0, 1000));
    }
  },
};
