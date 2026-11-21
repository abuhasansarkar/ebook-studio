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
 * `inherited` lists the sections this run took over from the previous failed
 * run of the same book, as `chapterId:position` keys. It separates a section
 * the customer has already paid for from one this run still has to write,
 * because both live in the same `generation_sections` table.
 */
interface WritingSnapshot { schema: 1; brief: BookBrief; title: string; chapters: ChapterInput[]; inherited: string[] }
interface SectionKey { jobId: string; chapterId: string; kind: string; position: number }

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
      // The provider call is the slow and chargeable part of writing a chapter.
      // When a run stops part-way, the sections it already wrote are stored, so
      // a new run can reuse them instead of paying for the same prose twice.
      // The inherited rows are re-keyed to the new job, which keeps every
      // section attached to the run that owns it.
      const previous = await tx.generationJob.findFirst({
        where: { bookId, type: 'chapters', status: 'failed' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      const reusable = new Map<string, { section: number; total: number }>();
      // The keys of the sections this run takes over from the failed run. They
      // are recorded on the job so the writing step can bill only the prose it
      // still has to write.
      const inherited: string[] = [];
      if (previous) {
        const saved = await tx.generationSection.findMany({ where: { jobId: previous.id } });
        // Only sections for chapters the current outline still holds are reusable.
        // Re-approving an edited outline replaces the chapters, and the old rows
        // then belong to a plan the book no longer follows.
        const live = new Set(pending.map(c => c.id));
        for (const section of saved) {
          if (!live.has(section.chapterId)) continue;
          await insertSection(
            { jobId: created.id, chapterId: section.chapterId, kind: section.kind, position: section.position },
            section.text,
            { inputTokens: section.inputTokens, outputTokens: section.outputTokens, model: section.model },
            tx,
          );
          if (section.kind === 'section') {
            const tally = reusable.get(section.chapterId) ?? { section: 0, total: 0 };
            tally.section += 1;
            tally.total += 1;
            reusable.set(section.chapterId, tally);
            inherited.push(`${section.chapterId}:${section.position}`);
          }
        }
      }
      // A section the failed run already wrote needs no provider call, so it is
      // not reserved either. The customer is only charged for the prose this
      // run actually has to write.
      const topicsOf = new Map(snapshot.chapters.map(c => [c.id, Math.max(1, c.keyPoints.length)]));
      const cost = pending.reduce((sum, c) => {
        const total = topicsOf.get(c.id) ?? 1;
        const saved = reusable.get(c.id)?.section ?? 0;
        const remaining = Math.max(0, total - saved);
        return sum + Math.round(chapterCredits(c.targetWords) * (remaining / total));
      }, 0);
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
        // The sections the failed run already wrote are reused, so they are not
        // charged for again. Only the prose this run still writes is billed.
        // The inherited list is what decides this, not what the table happens to
        // hold: a section an earlier attempt at this same job wrote is still
        // this job's prose and is still charged for exactly once.
        const inherited = new Set(snapshot.inherited ?? []);
        let toWrite = 0;
        for (let index = 0; index < topics.length; index++) {
          if (!inherited.has(`${chapter.id}:${index}`)) toWrite += 1;
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

          // Only the prose this run wrote is billed. Sections inherited from a
          // failed run were charged when they were first written.
          const share = topics.length ? Math.round(chapterCredits(chapter.targetWords) * (toWrite / topics.length)) : 0;
          await tx.generationJob.update({ where: { id: jobId }, data: { progress: { increment: 1 }, creditsCharged: { increment: share } } });
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
