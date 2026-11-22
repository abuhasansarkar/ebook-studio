import { spawn } from "node:child_process";
import { once } from "node:events";
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { chapterCredits, FREE_SIGNUP_CREDITS } from '@ebook/shared';
import { prisma } from '../src/database/prisma.js';
import { closeQueues, dispatchPending, getQueues, reconcileGenerationDispatches } from '../src/queues/index.js';
import { generationService } from '../src/services/generation/generationService.js';
import { claimJob, fence, finishJob, LeaseLost } from '../src/services/generation/jobRuntime.js';
import { outlineService } from '../src/services/outline/outlineService.js';
import { aiService } from '../src/services/ai/aiService.js';
import { AiIncompleteError } from '../src/services/ai/openaiClient.js';
import { creditService } from '../src/services/credits/creditService.js';
import { createUser, brief, ORIGIN } from './helpers.js';

async function prepared() {
  const owner = await createUser('recovery');
  const response = await owner.agent.post('/api/v1/books').set('Origin', ORIGIN).send(brief()).expect(201);
  await outlineService.process(response.body.job.id);
  await outlineService.approve(owner.user.id, response.body.book.id, 1);
  return { ...owner, bookId: response.body.book.id as string };
}
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await closeQueues(); await prisma.$disconnect(); });

describe('durable generation', () => {
  it('serializes concurrent starts and commits one reservation and dispatch', async () => {
    const { user, bookId } = await prepared();
    const results = await Promise.allSettled([generationService.start(user.id, bookId), generationService.start(user.id, bookId)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const jobs = await prisma.generationJob.findMany({ where: { bookId, type: 'chapters' } });
    expect(jobs).toHaveLength(1);
    expect(await prisma.queueDispatch.count({ where: { jobId: jobs[0].id } })).toBe(1);
    expect(await prisma.creditTransaction.count({ where: { reference: `job:${jobs[0].id}`, type: 'reserve' } })).toBe(1);
    await generationService.cancel(user.id, bookId);
  });

  it('persists sections, resumes after lease loss, and uses immutable inputs', async () => {
    const { user, bookId } = await prepared();
    const job = await generationService.start(user.id, bookId);
    const original = aiService.writeSection;
    let calls = 0;
    const spy = vi.spyOn(aiService, 'writeSection').mockImplementation(async input => {
      calls++;
      if (calls === 2) {
        await prisma.generationJob.update({ where: { id: job.id }, data: { leaseExpiresAt: new Date(0) } });
        throw new LeaseLost();
      }
      return original(input);
    });
    await generationService.process(job.id);
    expect(await prisma.generationSection.count({ where: { jobId: job.id, kind: 'section' } })).toBe(1);
    expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('running');
    spy.mockRestore();
    await prisma.book.update({ where: { id: bookId }, data: { title: 'Changed after queuing' } });
    const resumed = vi.spyOn(aiService, 'writeSection');
    await generationService.process(job.id);
    expect(resumed).toHaveBeenCalledTimes(8);
    expect(resumed.mock.calls.every(([input]) => input.bookTitle !== 'Changed after queuing')).toBe(true);
    await generationService.process(job.id);
    const finished = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finished).toMatchObject({ status: 'completed', progress: 3, creditsCharged: 3 * chapterCredits(800) });
    expect(await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.id } })).toMatchObject({ reserved: 0, balance: FREE_SIGNUP_CREDITS - 2 - 3 * chapterCredits(800) });
    expect(await prisma.creditTransaction.count({ where: { idempotencyKey: `settle:job:${job.id}` } })).toBe(1);
  });

  it('recovers a real worker process killed after a section commit', async () => {
    const { user, bookId } = await prepared();
    const job = await generationService.start(user.id, bookId);
    const child = spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/interrupted-generation.ts', job.id], { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        once(child, 'message'),
        once(child, 'exit').then(([code]) => { throw new Error(`Recovery fixture exited early: ${code}`); }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Worker checkpoint timeout')), 10000); }),
      ]);
      const exit = once(child, 'exit');
      child.kill('SIGKILL');
      const [, signal] = await exit;
      expect(signal).toBe('SIGKILL');
      expect(await prisma.generationSection.count({ where: { jobId: job.id, kind: 'section' } })).toBe(1);
      // Advance the persisted expiry instead of waiting two minutes in the test.
      await prisma.generationJob.update({ where: { id: job.id }, data: { leaseExpiresAt: new Date(0) } });
      const calls = vi.spyOn(aiService, 'writeSection');
      await generationService.process(job.id);
      expect(calls).toHaveBeenCalledTimes(8);
      expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('completed');
      expect((await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.id } })).reserved).toBe(0);
    } finally {
      if (timeout) clearTimeout(timeout);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  });

  it('fences a late provider response after another worker takes over', async () => {
    const { user, bookId } = await prepared();
    const job = await generationService.start(user.id, bookId);
    let started!: () => void;
    const startedPromise = new Promise<void>(resolve => { started = resolve; });
    let release!: (value: Awaited<ReturnType<typeof aiService.writeSection>>) => void;
    const response = new Promise<Awaited<ReturnType<typeof aiService.writeSection>>>(resolve => { release = resolve; });
    vi.spyOn(aiService, 'writeSection').mockImplementationOnce(() => { started(); return response; });
    const oldWorker = generationService.process(job.id);
    await startedPromise;
    await generationService.process(job.id); // live lease: no second provider call
    await prisma.generationJob.update({ where: { id: job.id }, data: { leaseExpiresAt: new Date(0) } });
    await generationService.process(job.id);
    release({ text: 'STALE RESPONSE MUST NOT COMMIT', usage: { model: 'stale', inputTokens: 999, outputTokens: 999 } });
    await oldWorker;
    expect(await prisma.generationSection.count({ where: { jobId: job.id, model: 'stale' } })).toBe(0);
    expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } })).creditsCharged).toBe(9);
  });

  it('rolls back terminal status and settlement together', async () => {
    const { user, bookId } = await prepared();
    const job = await generationService.start(user.id, bookId);
    const token = (await claimJob(job.id))!;
    await expect(prisma.$transaction(async tx => {
      await fence(tx, job.id, token);
      await finishJob(tx, job.id, 'failed');
      throw new Error('Simulated commit failure');
    })).rejects.toThrow('Simulated commit failure');
    expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('running');
    expect((await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.id } })).reserved).toBe(job.creditsReserved);
    expect(await prisma.creditTransaction.count({ where: { idempotencyKey: `settle:job:${job.id}` } })).toBe(0);
    await prisma.generationJob.update({ where: { id: job.id }, data: { leaseExpiresAt: new Date(0) } });
    await generationService.process(job.id);
    expect((await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.id } })).reserved).toBe(0);
  });

  it('reconciles a delivery lost after Redis accepted it', async () => {
    const { user, bookId } = await prepared();
    const job = await generationService.start(user.id, bookId);
    const delivery = await getQueues().chapters.getJob(job.id);
    await delivery?.remove();
    await prisma.queueDispatch.updateMany({ where: { jobId: job.id }, data: { dispatchedAt: new Date(0) } });
    await reconcileGenerationDispatches();
    await dispatchPending();
    expect(await getQueues().chapters.getJob(job.id)).toBeTruthy();
    await generationService.cancel(user.id, bookId);
  });

  it('checks cancellation before committing a provider response', async () => {
    const { user, bookId } = await prepared();
    const job = await generationService.start(user.id, bookId);
    const original = aiService.writeSection;
    vi.spyOn(aiService, 'writeSection').mockImplementationOnce(async input => {
      await generationService.cancel(user.id, bookId);
      return original(input);
    });
    await generationService.process(job.id);
    expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('cancelled');
    expect(await prisma.generationSection.count({ where: { jobId: job.id } })).toBe(0);
    expect((await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.id } })).reserved).toBe(0);
  });

  it('never checkpoints a truncated provider response', async () => {
    const { user, bookId } = await prepared();
    const job = await generationService.start(user.id, bookId);
    vi.spyOn(aiService, 'writeSection').mockRejectedValueOnce(new AiIncompleteError('gpt-test', 'incomplete', 'max_output_tokens'));
    await generationService.process(job.id);
    const finished = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finished.status).toBe('failed');
    expect(finished.creditsCharged).toBe(0);
    expect(await prisma.generationSection.count({ where: { jobId: job.id } })).toBe(0);
    expect((await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.id } })).reserved).toBe(0);
  });
});

describe('retry inheritance', () => {
  /** Starts a run, stores one written section for the first chapter, and fails the run. */
  async function failedRun(user: { id: string }, bookId: string, text = 'Written before the failure') {
    const job = await generationService.start(user.id, bookId);
    const chapter = await prisma.chapter.findFirstOrThrow({ where: { bookId }, orderBy: { position: 'asc' } });
    await prisma.generationSection.create({ data: { jobId: job.id, chapterId: chapter.id, kind: 'section', position: 0, text, model: 'mock' } });
    const token = (await claimJob(job.id))!;
    await prisma.$transaction(async tx => { await fence(tx, job.id, token, true); await finishJob(tx, job.id, 'failed', 'provider connection lost'); });
    return { job, chapter };
  }

  it('reuses the failed run\'s sections but charges every committed chapter in full, exactly once', async () => {
    const { user, bookId } = await prepared();
    const before = await creditService.getWallet(user.id);
    const { chapter } = await failedRun(user, bookId);
    expect((await creditService.getWallet(user.id)).balance).toBe(before.balance);
    const retry = await generationService.start(user.id, bookId);
    expect(retry.creditsReserved).toBe(3 * chapterCredits(800));
    const reused = await prisma.generationSection.findFirst({ where: { jobId: retry.id, chapterId: chapter.id, kind: 'section', position: 0 } });
    expect(reused?.text).toBe('Written before the failure');
    const calls = vi.spyOn(aiService, 'writeSection');
    await generationService.process(retry.id);
    // Three chapters with three topics each, one of which was inherited.
    expect(calls).toHaveBeenCalledTimes(8);
    const finished = await prisma.generationJob.findUniqueOrThrow({ where: { id: retry.id } });
    expect(finished).toMatchObject({ status: 'completed', creditsCharged: 3 * chapterCredits(800) });
    expect(await creditService.getWallet(user.id)).toMatchObject({ reserved: 0, balance: before.balance - 3 * chapterCredits(800) });
  });

  it('inherits only from the immediately preceding run, and only when it failed', async () => {
    const { user, bookId } = await prepared();
    await failedRun(user, bookId, 'Stale prose from an old failure');
    // A newer run was cancelled after the failure: the old prose is not revived.
    await generationService.start(user.id, bookId);
    await generationService.cancel(user.id, bookId);
    const third = await generationService.start(user.id, bookId);
    expect(await prisma.generationSection.count({ where: { jobId: third.id } })).toBe(0);
    await generationService.process(third.id);
    const chapters = await prisma.chapter.findMany({ where: { bookId } });
    expect(chapters.every(c => c.status === 'done')).toBe(true);
    expect(JSON.stringify(chapters.map(c => c.contentJson))).not.toContain('Stale prose');
  });

  it('does not reuse prose for a chapter that changed after the failed run', async () => {
    const { user, bookId } = await prepared();
    const { chapter } = await failedRun(user, bookId, 'Prose for the old plan');
    // The author retitles the chapter, which bumps its version.
    await prisma.chapter.update({ where: { id: chapter.id }, data: { title: 'A different chapter', version: { increment: 1 } } });
    const retry = await generationService.start(user.id, bookId);
    expect(await prisma.generationSection.count({ where: { jobId: retry.id } })).toBe(0);
    expect((retry as unknown as { inputSnapshot?: unknown }).inputSnapshot).toBeUndefined();
    const stored = await prisma.generationJob.findUniqueOrThrow({ where: { id: retry.id } });
    expect((stored.inputSnapshot as { inherited: string[] }).inherited).toEqual([]);
    await generationService.cancel(user.id, bookId);
  });
});
