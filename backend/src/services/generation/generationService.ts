import { bookBriefSchema, chapterCredits, documentError, type BookBrief } from '@ebook/shared';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { dispatchPending, persistDispatch } from '../../queues/index.js';
import { hasEntitlement } from '../billing/entitlements.js';
import { conflict, customerJobError, notFound } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { aiService } from '../ai/aiService.js';
import { getOwnedBook } from '../books/bookService.js';
import { reserveInTransaction } from '../credits/creditService.js';
import { countWords, markdownToTiptap } from '../editor/markdownToTiptap.js';
import { assertRuntimeAvailable } from '../runtime/readiness.js';
import { assertIdle, claimJob, fence, finishJob, finishOwned, GenerationCancelled, heartbeat, LeaseLost, lockBook } from './jobRuntime.js';

interface ChapterInput { id: string; version: number; position: number; title: string; goal: string; keyPoints: string[]; targetWords: number; summary: string | null; done: boolean }
/**
 * The immutable inputs of one writing run.
 *
 * `inherited` lists the sections this run took over from the immediately
 * preceding run of the same book when that run failed, as `chapterId:position`
 * keys. They save a provider call, not a charge: a section is billed only when
 * its chapter is committed, and the failed run never committed these chapters.
 */
interface WritingSnapshot { schema: 1; brief: BookBrief; title: string; chapters: ChapterInput[]; inherited: string[] }

/** The Prisma client or a transaction client; both expose the same query surface. */
type PrismaClientLike = Pick<typeof prisma, '$executeRaw' | 'generationSection'>;

interface SectionKey { jobId: string; chapterId: string; kind: string; position: number }

/**
 * Writes one generation section, ignoring a section another worker already
 * stored under the same key.
 *
 * The unique key is (jobId, chapterId, kind, position). Two workers can reach the
 * same key at once: the lease that guards the job can lapse while a provider call
 * is still in flight, so a second worker picks the job up and writes the same
 * section. The insert is therefore issued as an explicit
 * `INSERT ... ON CONFLICT DO NOTHING`, which resolves the race inside the
 * database instead of relying on a client-side conflict mode. The statement
 * reports how many rows it actually wrote, so only the worker that stored the
 * section charges its provider usage.
 *
 * The row that wins the race is the one the chapter is built from, so the stored
 * text is read back and returned. Both workers then build the chapter from the
 * same text.
 */
async function insertSection(key: SectionKey, text: string, usage: { inputTokens: number; outputTokens: number; model: string }, client: PrismaClientLike = prisma) {
  const inserted = await client.$executeRaw`
    INSERT INTO generation_sections ("id", "jobId", "chapterId", "kind", "position", "text", "inputTokens", "outputTokens", "model", "createdAt")
    VALUES (${randomUUID()}, ${key.jobId}, ${key.chapterId}, ${key.kind}, ${key.position}, ${text}, ${usage.inputTokens}, ${usage.outputTokens}, ${usage.model}, NOW())
    ON CONFLICT ("jobId", "chapterId", "kind", "position") DO NOTHING
  `;
  const stored = await client.generationSection.findUnique({ where: { jobId_chapterId_kind_position: key } });
  return { inserted, text: stored?.text ?? text };
}

async function checkpoint(jobId: string, token: string, chapterId: string, kind: 'section' | 'summary', position: number, generate: () => Promise<{ text: string; usage: { inputTokens: number; outputTokens: number; model: string } }>) {
  const key = { jobId, chapterId, kind, position };
  const existing = await prisma.generationSection.findUnique({ where: { jobId_chapterId_kind_position: key } });
  if (existing) return { text: existing.text, written: false };
  const result = await generate();
  // Provider requests may repeat if the process dies before this commit. Customer
  // credits only accrue at the fenced chapter commit, never per delivery attempt.
  //
  // The section is written with an insert that skips duplicates rather than an
  // upsert. Two workers can reach the same section key at once — the existence
  // check above and this write are separate steps — and an upsert resolves that
  // race with an update, which raises a serialization failure when the two
  // transactions collide. Skipping the duplicate keeps the section that was
  // committed first, which is the one the chapter is built from.
  //
  // The write shares the fenced transaction, so a cancellation that arrives
  // while the provider was working rolls the section back with the rest of the
  // transaction: a cancelled run stores nothing. The fence takes the job row
  // lock and the insert touches only the section table, so the two never wait
  // on each other in a cycle.
  const { inserted, text } = await prisma.$transaction(async tx => {
    await fence(tx, jobId, token);
    const written = await insertSection(key, result.text, result.usage, tx);
    // Only the call that actually wrote the section counts its token usage.
    // When the row was already there, the call that wrote it already counted it.
    if (written.inserted > 0) {
      await tx.generationJob.update({ where: { id: jobId }, data: { inputTokens: { increment: result.usage.inputTokens }, outputTokens: { increment: result.usage.outputTokens }, model: result.usage.model } });
    }
    return written;
  });
  // `written` says this call stored the section. A section that was already
  // there was written by an earlier attempt at this same job, which is a
  // delivery that repeats rather than a section that still needs writing.
  return { text, written: inserted > 0 };
}

/** True when a chapter's writing inputs are exactly what an earlier run was given. */
function sameChapterInputs(before: ChapterInput | undefined, now: ChapterInput) {
  return !!before && !before.done && before.version === now.version && before.title === now.title && before.goal === now.goal
    && before.targetWords === now.targetWords && JSON.stringify(before.keyPoints) === JSON.stringify(now.keyPoints);
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
      const snapshot: WritingSnapshot = { schema: 1, brief, title: book.title, inherited: [], chapters: chapters.map(c => ({ id: c.id, version: c.version, position: c.position, title: c.title, goal: c.goal, keyPoints: (Array.isArray(c.keyPoints) ? c.keyPoints : []).filter((s): s is string => typeof s === 'string' && !!s.trim()), targetWords: c.targetWords, summary: c.summary, done: c.status === 'done' })) };
      const created = await tx.generationJob.create({ data: { userId, bookId, type: 'chapters', total: pending.length, creditsReserved: 0, inputSnapshot: snapshot as unknown as object } });
      // A retry inherits the sections the failed run already saved.
      //
      // The provider call is the slow part of writing a chapter. When a run
      // stops part-way, the sections it already wrote are stored, so the next
      // run can reuse them instead of asking the provider for the same prose
      // twice. The inherited rows are re-keyed to the new job, which keeps every
      // section attached to the run that owns it.
      //
      // Only the book's immediately preceding writing run is a candidate, and
      // only when it failed: a run that completed, or was cancelled, after an
      // older failure means that older prose is no longer the latest attempt.
      // A chapter is reused only while it is exactly the chapter the failed run
      // was writing (same version, title, goal, key points and length), so a
      // chapter the author cleared, edited or re-planned starts afresh.
      const previous = await tx.generationJob.findFirst({
        where: { bookId, type: 'chapters', id: { not: created.id } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, status: true, inputSnapshot: true },
      });
      const inherited: string[] = [];
      if (previous?.status === 'failed') {
        const before = new Map(((previous.inputSnapshot as unknown as WritingSnapshot | null)?.chapters ?? []).map(c => [c.id, c]));
        const unchanged = new Set(snapshot.chapters.filter(c => !c.done && sameChapterInputs(before.get(c.id), c)).map(c => c.id));
        const saved = await tx.generationSection.findMany({ where: { jobId: previous.id, chapterId: { in: [...unchanged] } }, orderBy: [{ chapterId: 'asc' }, { kind: 'asc' }, { position: 'asc' }] });
        // A chapter the failed run committed was charged then; it is never revived.
        const committed = new Set(saved.filter(r => r.kind === 'committed').map(r => r.chapterId));
        for (const section of saved) {
          if (section.kind === 'committed' || committed.has(section.chapterId)) continue;
          await insertSection(
            { jobId: created.id, chapterId: section.chapterId, kind: section.kind, position: section.position },
            section.text,
            { inputTokens: section.inputTokens, outputTokens: section.outputTokens, model: section.model },
            tx,
          );
          if (section.kind === 'section') inherited.push(`${section.chapterId}:${section.position}`);
        }
      }
      // Every pending chapter is reserved at its full price. Inherited sections
      // were never charged (charges happen only at a chapter commit, and the
      // failed run did not commit these chapters), so this run charges them
      // exactly once, when it commits the chapter they belong to.
      const cost = pending.reduce((sum, c) => sum + chapterCredits(c.targetWords), 0);
      await tx.generationJob.update({ where: { id: created.id }, data: { creditsReserved: cost, inputSnapshot: { ...snapshot, inherited } as unknown as object } });
      await reserveInTransaction(tx, userId, cost, `job:${created.id}`);
      // Protect queued chapters from edits until their fixed inputs are processed.
      await tx.chapter.updateMany({ where: { id: { in: pending.map(c => c.id) } }, data: { status: 'generating', error: null } });
      await tx.book.update({ where: { id: bookId }, data: { status: 'generating' } });
      await persistDispatch(tx, 'chapters', created.id, paid);
      // The row is returned as it now stands, so the caller sees the amount
      // that was actually reserved rather than the placeholder of the insert.
      return tx.generationJob.findUniqueOrThrow({ where: { id: created.id } });
    });
    // Broker availability cannot undo the committed job. Dispatcher owns retries.
    await dispatchPending().catch(() => undefined);
    const { inputSnapshot: _snapshot, leaseToken: _token, ...publicJob } = job;
    return publicJob;
  },

  /**
   * Cancels the book's active generation, or exactly `jobId` when given (an
   * operator acts on one job and must never cancel a different one).
   */
  async cancel(userId: string, bookId: string, jobId?: string) {
    await getOwnedBook(userId, bookId);
    return prisma.$transaction(async tx => {
      const job = await tx.generationJob.findFirst({ where: { bookId, ...(jobId ? { id: jobId } : {}), status: { in: ['queued', 'running'] } }, orderBy: { createdAt: 'desc' } });
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
          const { text } = await checkpoint(jobId, token, chapter.id, 'section', index, () => aiService.writeSection({ brief: snapshot.brief, bookTitle: snapshot.title, allChapterTitles: snapshot.chapters.map(c => c.title), chapter: { title: chapter.title, goal: chapter.goal, keyPoints: topics }, chapterIndex: chapter.position, previousSummaries, sectionTopic: topics[index], sectionIndex: index, sectionCount: topics.length, writtenSoFar: markdown, targetWords: Math.max(150, Math.round(chapter.targetWords / topics.length)) }));
          markdown += (markdown ? '\n\n' : '') + text;
        }
        const { text: summary } = await checkpoint(jobId, token, chapter.id, 'summary', 0, () => aiService.summarizeChapter(chapter.title, markdown, snapshot.brief.language));
        const contentJson = markdownToTiptap(markdown);
        const invalid = documentError(contentJson);
        if (invalid) throw new Error(`Generated document failed validation: ${invalid}`);
        await prisma.$transaction(async tx => {
          await fence(tx, jobId, token);
          const current = await tx.chapter.findUniqueOrThrow({ where: { id: chapter.id } });
          const result = await tx.chapter.updateMany({ where: { id: chapter.id, version: chapter.version, status: 'generating' }, data: { status: 'done', contentJson: contentJson as object, summary, wordCount: countWords(markdown), version: { increment: 1 }, error: null } });
          if (!result.count) throw conflict('The chapter changed after generation was queued. Its edits were preserved.');
          await tx.documentVersion.create({ data: { chapterId: chapter.id, version: current.version, title: current.title, ...(current.contentJson ? { contentJson: current.contentJson } : {}), wordCount: current.wordCount, savedAt: current.updatedAt } });
          // The chapter update above is guarded by its version, so this row is
          // written once. The insert ignores a duplicate anyway, so a retried
          // commit cannot fail on the unique constraint and lose the progress it
          // already recorded.
          await insertSection(
            { jobId, chapterId: chapter.id, kind: 'committed', position: 0 },
            summary,
            { inputTokens: 0, outputTokens: 0, model: 'checkpoint' },
            tx,
          );

          // The chapter is billed once, here, at its full price, whether its
          // sections were written by this run or inherited from a failed one:
          // no section is charged before the commit of its chapter.
          await tx.generationJob.update({ where: { id: jobId }, data: { progress: { increment: 1 }, creditsCharged: { increment: chapterCredits(chapter.targetWords) } } });
        });
        previousSummaries.push(summary);
      }
      await finishOwned(jobId, token, 'completed');
    } catch (error) {
      if (error instanceof LeaseLost) return;
      const cancelled = error instanceof GenerationCancelled;
      if (!cancelled) logger.error({ err: error, jobId }, 'Chapter generation failed');
      try { await finishOwned(jobId, token, cancelled ? 'cancelled' : 'failed', cancelled ? undefined : customerJobError(error, 'The AI writer did not return a usable response. Retry to continue; finished chapters are kept.')); }
      catch (finishError) { if (!(finishError instanceof LeaseLost)) throw finishError; }
    } finally { stop(); }
  },
};
