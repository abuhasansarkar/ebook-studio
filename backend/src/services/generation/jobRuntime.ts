import { randomUUID } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { conflict, notFound } from '../../utils/errors.js';
import { settleInTransaction, type Tx } from '../credits/creditService.js';

export const LEASE_MS = 120_000;
export class LeaseLost extends Error { constructor() { super('Generation lease is no longer owned by this worker'); } }
export class GenerationCancelled extends Error {}

export async function lockBook(tx: Tx, bookId: string, userId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM books WHERE id = ${bookId} AND "userId" = ${userId} AND "deletedAt" IS NULL FOR UPDATE`;
  if (!rows.length) throw notFound('Book');
}

export async function assertIdle(tx: Tx, bookId: string) {
  const active = await tx.generationJob.findFirst({ where: { bookId, status: { in: ['queued', 'running'] } } });
  if (active) throw conflict('Generation is already running for this book.', { jobId: active.id });
}

/** An update acquires the row lock, fencing every subsequent write in this transaction. */
export async function fence(tx: Tx, jobId: string, token: string, allowCancellation = false) {
  const result = await tx.generationJob.updateMany({
    where: { id: jobId, leaseToken: token, status: 'running', leaseExpiresAt: { gt: new Date() } },
    data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
  });
  if (!result.count) throw new LeaseLost();
  const job = await tx.generationJob.findUniqueOrThrow({ where: { id: jobId } });
  const book = await tx.book.findUniqueOrThrow({ where: { id: job.bookId }, select: { deletedAt: true } });
  if (!allowCancellation && (job.cancelRequested || book.deletedAt)) throw new GenerationCancelled();
  return job;
}

export async function claimJob(id: string) {
  const token = randomUUID();
  const claim = await prisma.generationJob.updateMany({
    where: { id, status: { in: ['queued', 'running'] }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: new Date() } }] },
    data: { status: 'running', startedAt: new Date(), leaseToken: token, leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
  });
  return claim.count ? token : null;
}

export function heartbeat(id: string, token: string) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await prisma.generationJob.updateMany({ where: { id, leaseToken: token, status: 'running', leaseExpiresAt: { gt: new Date() } }, data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) } });
    } catch { /* A later fenced write must prove ownership; failed heartbeats never grant it. */ }
    finally { running = false; }
  }, LEASE_MS / 4);
  timer.unref();
  return () => clearInterval(timer);
}

export async function finishJob(tx: Tx, jobId: string, status: 'completed' | 'failed' | 'cancelled', error?: string) {
  const job = await tx.generationJob.update({ where: { id: jobId }, data: { status, finishedAt: new Date(), error: error?.slice(0, 1000) ?? null, leaseToken: null, leaseExpiresAt: null } });
  await settleInTransaction(tx, job.userId, job.creditsReserved, job.creditsCharged, `job:${job.id}`);
  if (job.type === 'chapters') {
    await tx.chapter.updateMany({ where: { bookId: job.bookId, status: 'generating' }, data: { status: 'pending' } });
    const remaining = await tx.chapter.count({ where: { bookId: job.bookId, status: { not: 'done' } } });
    await tx.book.update({ where: { id: job.bookId }, data: { status: remaining === 0 ? 'written' : status === 'failed' ? 'failed' : 'outline_ready' } });
  }
  return job;
}

export async function finishOwned(id: string, token: string, status: 'completed' | 'failed' | 'cancelled', error?: string) {
  return prisma.$transaction(async tx => {
    const job = await fence(tx, id, token, true);
    return finishJob(tx, id, job.cancelRequested ? 'cancelled' : status, error);
  });
}
