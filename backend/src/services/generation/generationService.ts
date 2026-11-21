import { bookBriefSchema, chapterCredits, documentError, type BookBrief } from '@ebook/shared';
import { prisma } from '../../database/prisma.js';
import { dispatchPending, persistDispatch } from '../../queues/index.js';
import { hasEntitlement } from '../billing/entitlements.js';
import { conflict, notFound } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { aiService } from '../ai/aiService.js';
import { getOwnedBook } from '../books/bookService.js';
import { reserveInTransaction } from '../credits/creditService.js';
import { countWords, markdownToTiptap } from '../editor/markdownToTiptap.js';
import { assertRuntimeAvailable } from '../runtime/readiness.js';
import { assertIdle, claimJob, fence, finishJob, finishOwned, GenerationCancelled, heartbeat, LeaseLost, lockBook } from './jobRuntime.js';

interface ChapterInput { id: string; version: number; position: number; title: string; goal: string; keyPoints: string[]; targetWords: number; summary: string | null; done: boolean }
interface WritingSnapshot { schema: 1; brief: BookBrief; title: string; chapters: ChapterInput[] }

async function checkpoint(jobId: string, token: string, chapterId: string, kind: 'section' | 'summary', position: number, generate: () => Promise<{ text: string; usage: { inputTokens: number; outputTokens: number; model: string } }>) {
  await prisma.$transaction(tx => fence(tx, jobId, token));
  const key = { jobId, chapterId, kind, position };
  const existing = await prisma.generationSection.findUnique({ where: { jobId_chapterId_kind_position: key } });
  if (existing) return existing.text;
  const result = await generate();
  // Provider requests may repeat if the process dies before this commit. Customer
  // credits only accrue at the fenced chapter commit, never per delivery attempt.
  await prisma.$transaction(async tx => {
    await fence(tx, jobId, token);
    await tx.generationSection.create({ data: { ...key, text: result.text, ...result.usage } });
    await tx.generationJob.update({ where: { id: jobId }, data: { inputTokens: { increment: result.usage.inputTokens }, outputTokens: { increment: result.usage.outputTokens }, model: result.usage.model } });
  });
  return result.text;
}

export const generationService = {
  async start(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    await assertRuntimeAvailable();
    // A plan with the `priorityJobs` entitlement puts its work ahead of
    // ordinary work in the queue. The decision is recorded on the dispatch
    // row, so the dispatcher does not have to re-read the entitlement later.
    const paid = await hasEntitlement(userId, 'priorityJobs');
    const job = await prisma.$transaction(async tx => {
      await lockBook(tx, bookId, userId);
      await assertIdle(tx, bookId);
      const outline = await tx.outline.findFirst({ where: { bookId }, orderBy: { version: 'desc' } });
      if (!outline?.approvedAt) throw conflict('Approve the outline before generating chapters.');
      const book = await tx.book.findUniqueOrThrow({ where: { id: bookId } });
      const brief = bookBriefSchema.parse((await tx.bookBrief.findUniqueOrThrow({ where: { bookId } })).data);
      const chapters = await tx.chapter.findMany({ where: { bookId }, orderBy: { position: 'asc' } });
      const pending = chapters.filter(c => c.status !== 'done');
      if (!pending.length) throw conflict('All chapters are already written.');
      const snapshot: WritingSnapshot = { schema: 1, brief, title: book.title, chapters: chapters.map(c => ({ id: c.id, version: c.version, position: c.position, title: c.title, goal: c.goal, keyPoints: (Array.isArray(c.keyPoints) ? c.keyPoints : []).filter((s): s is string => typeof s === 'string' && !!s.trim()), targetWords: c.targetWords, summary: c.summary, done: c.status === 'done' })) };
      const cost = pending.reduce((sum, c) => sum + chapterCredits(c.targetWords), 0);
      const created = await tx.generationJob.create({ data: { userId, bookId, type: 'chapters', total: pending.length, creditsReserved: cost, inputSnapshot: snapshot as unknown as object } });
      await reserveInTransaction(tx, userId, cost, `job:${created.id}`);
      // Protect queued chapters from edits until their fixed inputs are processed.
      await tx.chapter.updateMany({ where: { id: { in: pending.map(c => c.id) } }, data: { status: 'generating', error: null } });
      await tx.book.update({ where: { id: bookId }, data: { status: 'generating' } });
      await persistDispatch(tx, 'chapters', created.id, paid);
      return created;
    });
    // Broker availability cannot undo the committed job. Dispatcher owns retries.
    await dispatchPending().catch(() => undefined);
    const { inputSnapshot: _snapshot, leaseToken: _token, ...publicJob } = job;
    return publicJob;
  },

  async cancel(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    return prisma.$transaction(async tx => {
      const job = await tx.generationJob.findFirst({ where: { bookId, status: { in: ['queued', 'running'] } }, orderBy: { createdAt: 'desc' } });
      if (!job) throw conflict('There is no running generation to cancel.');
      const queued = await tx.generationJob.updateMany({ where: { id: job.id, status: 'queued' }, data: { cancelRequested: true } });
      if (queued.count) return finishJob(tx, job.id, 'cancelled');
      const updated = await tx.generationJob.updateMany({ where: { id: job.id, status: 'running' }, data: { cancelRequested: true } });
      if (!updated.count) throw conflict('Generation already finished.');
      return tx.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    });
  },

  async getJob(userId: string, jobId: string) {
    const job = await prisma.generationJob.findFirst({ where: { id: jobId, userId, book: { deletedAt: null } } });
    if (!job) throw notFound('Job');
    const savedSections = await prisma.generationSection.count({ where: { jobId, kind: 'section' } });
    const { inputSnapshot: _snapshot, leaseToken: _token, ...publicJob } = job;
    return { ...publicJob, savedSections };
  },

  async process(jobId: string) {
    const token = await claimJob(jobId);
    if (!token) return;
    const stop = heartbeat(jobId, token);
    try {
      const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } });
      const snapshot = job.inputSnapshot as unknown as WritingSnapshot | null;
      if (!snapshot || snapshot.schema !== 1) throw new Error('Legacy job has no input snapshot. Cancel and restart generation.');
      const previousSummaries: string[] = [];
      for (const chapter of snapshot.chapters) {
        if (chapter.done) { previousSummaries.push(chapter.summary ?? chapter.goal); continue; }
        const committed = await prisma.generationSection.findUnique({ where: { jobId_chapterId_kind_position: { jobId, chapterId: chapter.id, kind: 'committed', position: 0 } } });
        if (committed) { previousSummaries.push(committed.text); continue; }
        const topics = chapter.keyPoints.length ? chapter.keyPoints : [chapter.title];
        let markdown = '';
        for (let index = 0; index < topics.length; index++) {
          const text = await checkpoint(jobId, token, chapter.id, 'section', index, () => aiService.writeSection({ brief: snapshot.brief, bookTitle: snapshot.title, allChapterTitles: snapshot.chapters.map(c => c.title), chapter: { title: chapter.title, goal: chapter.goal, keyPoints: topics }, chapterIndex: chapter.position, previousSummaries, sectionTopic: topics[index], sectionIndex: index, sectionCount: topics.length, writtenSoFar: markdown, targetWords: Math.max(150, Math.round(chapter.targetWords / topics.length)) }));
          markdown += (markdown ? '\n\n' : '') + text;
        }
        const summary = await checkpoint(jobId, token, chapter.id, 'summary', 0, () => aiService.summarizeChapter(chapter.title, markdown, snapshot.brief.language));
        const contentJson = markdownToTiptap(markdown);
        const invalid = documentError(contentJson);
        if (invalid) throw new Error(`Generated document failed validation: ${invalid}`);
        await prisma.$transaction(async tx => {
          await fence(tx, jobId, token);
          const current = await tx.chapter.findUniqueOrThrow({ where: { id: chapter.id } });
          const result = await tx.chapter.updateMany({ where: { id: chapter.id, version: chapter.version, status: 'generating' }, data: { status: 'done', contentJson: contentJson as object, summary, wordCount: countWords(markdown), version: { increment: 1 }, error: null } });
          if (!result.count) throw conflict('The chapter changed after generation was queued. Its edits were preserved.');
          await tx.documentVersion.create({ data: { chapterId: chapter.id, version: current.version, title: current.title, ...(current.contentJson ? { contentJson: current.contentJson } : {}), wordCount: current.wordCount, savedAt: current.updatedAt } });
          await tx.generationSection.create({ data: { jobId, chapterId: chapter.id, kind: 'committed', position: 0, text: summary, model: 'checkpoint' } });
          await tx.generationJob.update({ where: { id: jobId }, data: { progress: { increment: 1 }, creditsCharged: { increment: chapterCredits(chapter.targetWords) } } });
        });
        previousSummaries.push(summary);
      }
      await finishOwned(jobId, token, 'completed');
    } catch (error) {
      if (error instanceof LeaseLost) return;
      const cancelled = error instanceof GenerationCancelled;
      if (!cancelled) logger.error({ err: error, jobId }, 'Chapter generation failed');
      try { await finishOwned(jobId, token, cancelled ? 'cancelled' : 'failed', cancelled ? undefined : (error instanceof Error ? error.message : 'Generation failed')); }
      catch (finishError) { if (!(finishError instanceof LeaseLost)) throw finishError; }
    } finally { stop(); }
  },
};
