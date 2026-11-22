import { afterAll, describe, expect, it, vi } from 'vitest';
import { bookBriefSchema } from '@ebook/shared';
import { prisma } from '../src/database/prisma.js';
import { closeQueues, getQueues } from '../src/queues/index.js';
import { bookService } from '../src/services/books/bookService.js';
import { EXPORT_LEASE_MS, EXPORT_MAX_ATTEMPTS, EXPORT_QUEUED_STALE_MS, exportService, reconcileExports } from '../src/services/exports/exportService.js';
import * as renderers from '../src/services/exports/renderers.js';
import { closeBrowser } from '../src/services/exports/pdfRenderer.js';
import { markdownToTiptap } from '../src/services/editor/markdownToTiptap.js';
import { brief, createUser, grantEntitlements, PAID_ENTITLEMENTS } from './helpers.js';

const flags = vi.hoisted(() => ({ failDispatch: false }));
vi.mock('../src/queues/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/queues/index.js')>();
  return {
    ...actual,
    persistDispatch: (...args: Parameters<typeof actual.persistDispatch>) =>
      flags.failDispatch ? Promise.reject(new Error('simulated crash before dispatch')) : actual.persistDispatch(...args),
  };
});

afterAll(async () => { await closeBrowser(); await closeQueues(); await prisma.$disconnect(); });

async function setup() {
  const user = await createUser('export-recovery');
  await grantEntitlements(user.user.id, PAID_ENTITLEMENTS);
  const book = await bookService.create(user.user.id, bookBriefSchema.parse(brief({ title: 'Recovery Manual' }).brief));
  await prisma.chapter.create({ data: { bookId: book.id, position: 0, title: 'One', status: 'done', wordCount: 10, contentJson: markdownToTiptap('Some written text.') as object } });
  return { ...user, book };
}
const ago = (ms: number) => new Date(Date.now() - ms);

describe('export lifecycle recovery', () => {
  it('creates the export and its dispatch intent together', async () => {
    const a = await setup();
    const exp = await exportService.request(a.user.id, a.book.id, 'docx');
    expect(await prisma.queueDispatch.count({ where: { queue: 'exports', jobId: exp.id } })).toBe(1);
    expect(exp).not.toHaveProperty('leaseToken');
    await exportService.process(exp.id);
  });

  it('leaves no export behind when the dispatch cannot be recorded', async () => {
    const a = await setup();
    const before = await prisma.export.count({ where: { bookId: a.book.id } });
    flags.failDispatch = true;
    await expect(exportService.request(a.user.id, a.book.id, 'docx')).rejects.toThrow('simulated crash before dispatch');
    flags.failDispatch = false;
    // The insert rolled back with the dispatch: no orphaned queued row blocks the book.
    expect(await prisma.export.count({ where: { bookId: a.book.id } })).toBe(before);
    const exp = await exportService.request(a.user.id, a.book.id, 'docx');
    await exportService.process(exp.id);
    expect((await prisma.export.findUniqueOrThrow({ where: { id: exp.id } })).status).toBe('ready');
  });

  it('treats an export whose worker died as failed, so a new export can start', async () => {
    const a = await setup();
    const stuck = await exportService.request(a.user.id, a.book.id, 'docx');
    await prisma.export.update({ where: { id: stuck.id }, data: { status: 'processing', leaseToken: 'dead-worker', leaseExpiresAt: ago(1000), attempts: 1 } });
    const next = await exportService.request(a.user.id, a.book.id, 'docx');
    expect(next.id).not.toBe(stuck.id);
    expect(await prisma.export.findUniqueOrThrow({ where: { id: stuck.id } })).toMatchObject({ status: 'failed', leaseToken: null });
    await exportService.process(next.id);
  });

  it('still refuses while an export holds a live lease', async () => {
    const a = await setup();
    const running = await exportService.request(a.user.id, a.book.id, 'docx');
    await prisma.export.update({ where: { id: running.id }, data: { status: 'processing', leaseToken: 'live-worker', leaseExpiresAt: new Date(Date.now() + EXPORT_LEASE_MS) } });
    await expect(exportService.request(a.user.id, a.book.id, 'docx')).rejects.toMatchObject({ status: 409 });
    // A second delivery does not steal a live lease.
    await exportService.process(running.id);
    expect(await prisma.export.findUniqueOrThrow({ where: { id: running.id } })).toMatchObject({ status: 'processing', leaseToken: 'live-worker' });
    await prisma.export.update({ where: { id: running.id }, data: { status: 'failed' } });
  });

  it('fails a queued export that was never started', async () => {
    const a = await setup();
    const old = await exportService.request(a.user.id, a.book.id, 'docx');
    await prisma.export.update({ where: { id: old.id }, data: { createdAt: ago(EXPORT_QUEUED_STALE_MS + 1000) } });
    await reconcileExports();
    expect(await prisma.export.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ status: 'failed' });
  });

  it('dispatches a legacy orphaned queued export and re-dispatches a lost delivery', async () => {
    const a = await setup();
    // A row created before the outbox existed, by a request that crashed before enqueueing.
    const orphan = await prisma.export.create({ data: { userId: a.user.id, bookId: a.book.id, format: 'docx', createdAt: ago(120_000) } });
    const first = await reconcileExports();
    expect(first.orphaned).toBeGreaterThanOrEqual(1);
    expect(await prisma.queueDispatch.count({ where: { queue: 'exports', jobId: orphan.id } })).toBe(1);
    expect(await getQueues().exports.getJob(orphan.id)).toBeTruthy();
    // Redis loses the delivery after accepting it.
    await (await getQueues().exports.getJob(orphan.id))?.remove();
    await prisma.queueDispatch.updateMany({ where: { queue: 'exports', jobId: orphan.id }, data: { dispatchedAt: ago(60_000) } });
    const second = await reconcileExports();
    expect(second.redispatched).toBeGreaterThanOrEqual(1);
    expect(await getQueues().exports.getJob(orphan.id)).toBeTruthy();
    await exportService.process(orphan.id);
    expect((await prisma.export.findUniqueOrThrow({ where: { id: orphan.id } })).status).toBe('ready');
  });

  it('fences a late worker whose export was reconciled meanwhile', async () => {
    const a = await setup();
    const exp = await exportService.request(a.user.id, a.book.id, 'docx');
    const real = renderers.renderExport;
    vi.spyOn(renderers, 'renderExport').mockImplementationOnce(async (...args) => {
      // The lease lapses and the reconciler fails the export while the render runs.
      await prisma.export.update({ where: { id: exp.id }, data: { leaseExpiresAt: ago(1000) } });
      await reconcileExports();
      return real(...args);
    });
    await exportService.process(exp.id);
    vi.restoreAllMocks();
    const row = await prisma.export.findUniqueOrThrow({ where: { id: exp.id } });
    expect(row.status).toBe('failed');
    expect(row.storageKey).toBeNull();
  });

  it('abandons an export that keeps crashing its worker', async () => {
    const a = await setup();
    const exp = await exportService.request(a.user.id, a.book.id, 'docx');
    await prisma.export.update({ where: { id: exp.id }, data: { status: 'processing', attempts: EXPORT_MAX_ATTEMPTS, leaseExpiresAt: ago(1000) } });
    await exportService.process(exp.id);
    expect(await prisma.export.findUniqueOrThrow({ where: { id: exp.id } })).toMatchObject({ status: 'failed' });
  });
});
