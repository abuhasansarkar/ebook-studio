import { createHash, randomUUID } from 'node:crypto';
import { imageRequestSchema, defaultCover, coverDesignSchema } from '@ebook/shared';
import type { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { env } from '../../config/env.js';
import { conflict, notFound, serviceUnavailable } from '../../utils/errors.js';
import { dispatchPending, persistDispatch } from '../../queues/index.js';
import { reserveInTransaction } from '../credits/creditService.js';
import { assertIdle, claimJob, fence, finishJob, finishOwned, GenerationCancelled, heartbeat, LeaseLost, lockBook } from '../generation/jobRuntime.js';
import { getOwnedBook } from '../books/bookService.js';
import { assertRuntimeAvailable } from '../runtime/readiness.js';
import { sanitizeImage } from '../assets/assetService.js';
import { storage } from '../storage/storage.js';
import { imageProvider, imageSnapshotSchema } from './imageProvider.js';
import { logger } from '../../utils/logger.js';

const publicSelect = { id: true, status: true, cancelRequested: true, assetId: true, error: true, creditsReserved: true, creditsCharged: true, createdAt: true, model: true } as const;
export const imageGenerationService = {
  async request(userId: string, bookId: string, input: z.infer<typeof imageRequestSchema>) {
    await getOwnedBook(userId, bookId); await assertRuntimeAvailable();
    if (!env.AI_MOCK && !env.OPENAI_API_KEY) throw serviceUnavailable('Image generation is not configured.');
    if (input.expectedCredits !== env.IMAGE_GENERATION_CREDITS) throw conflict('Image pricing changed. Refresh the studio before generating.');
    const job = await prisma.$transaction(async tx => {
      await lockBook(tx, bookId, userId); await assertIdle(tx, bookId);
      const book = await tx.book.findUniqueOrThrow({ where: { id: bookId } });
      const cover = await tx.coverDesign.findFirst({ where: { bookId }, orderBy: { version: 'desc' } });
      const visual = (cover ? coverDesignSchema.parse(cover.data) : defaultCover(book.title)).visual;
      const created = await tx.generationJob.create({ data: { userId, bookId, type: 'image', total: 1, creditsReserved: env.IMAGE_GENERATION_CREDITS, model: env.OPENAI_IMAGE_MODEL, inputSnapshot: { schema: 1, request: input, visual, title: book.title, model: env.OPENAI_IMAGE_MODEL } } });
      await reserveInTransaction(tx, userId, created.creditsReserved, `job:${created.id}`);
      await persistDispatch(tx, 'images', created.id);
      return tx.generationJob.findUniqueOrThrow({ where: { id: created.id }, select: publicSelect });
    });
    await dispatchPending().catch(() => undefined); return job;
  },
  async history(userId: string, bookId: string, cursor?: string) {
    await getOwnedBook(userId, bookId);
    const jobs = await prisma.generationJob.findMany({ where: { userId, bookId, type: 'image', ...(cursor ? { id: { lt: cursor } } : {}) }, orderBy: { id: 'desc' }, take: 21, select: { ...publicSelect, inputSnapshot: true } });
    return { jobs: jobs.slice(0, 20).map(({ inputSnapshot, ...job }) => ({ ...job, input: inputSnapshot })), nextCursor: jobs.length > 20 ? jobs[19].id : null };
  },
  async cancel(userId: string, bookId: string, id: string) {
    await getOwnedBook(userId, bookId);
    return prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM generation_jobs WHERE id = ${id} AND "userId" = ${userId} AND "bookId" = ${bookId} AND type = 'image' FOR UPDATE`;
      if (!rows.length) throw notFound('Image job');
      const job = await tx.generationJob.findUniqueOrThrow({ where: { id } });
      if (!['queued', 'running'].includes(job.status)) return;
      await tx.generationJob.update({ where: { id }, data: { cancelRequested: true } });
      if (job.status === 'queued') await finishJob(tx, id, 'cancelled');
    });
  },
  async process(id: string) {
    const token = await claimJob(id); if (!token) return;
    const stop = heartbeat(id, token);
    try {
      const job = await prisma.$transaction(tx => fence(tx, id, token));
      if (job.type !== 'image') throw new Error('Wrong image job type');
      const snapshot = imageSnapshotSchema.parse(job.inputSnapshot);
      let asset = job.assetId ? await prisma.asset.findUnique({ where: { id: job.assetId } }) : null;
      let data: Buffer | null = null;
      if (asset?.status === 'processing') {
        try {
          const { stream } = await storage.getStream(asset.storageKey); const chunks: Buffer[] = []; let bytes = 0;
          for await (const chunk of stream) { const b = Buffer.from(chunk); bytes += b.length; if (bytes > 10 * 1024 * 1024) { stream.destroy(); throw new Error('Invalid image checkpoint'); } chunks.push(b); }
          data = Buffer.concat(chunks);
          if (createHash('sha256').update(data).digest('hex') !== asset.sha256) throw new Error('Image checkpoint hash mismatch');
        } catch (err) {
          if (!['ENOENT', 'NoSuchKey', 'NotFound'].includes(String((err as { code?: string; name?: string }).code ?? (err as Error).name))) throw err;
        }
      }
      if (!data) {
        const raw = await imageProvider.generate(snapshot);
        const mime = raw.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
          : raw[0] === 255 && raw[1] === 216 && raw[2] === 255 ? 'image/jpeg'
          : 'image/webp';
        const sanitized = await sanitizeImage(raw, mime); data = sanitized.data;
        const hash = createHash('sha256').update(data).digest('hex');
        asset = await prisma.$transaction(async tx => {
          await fence(tx, id, token);
          if (asset) await tx.asset.updateMany({ where: { id: asset.id, status: 'processing' }, data: { status: 'deleting' } });
          const created = await tx.asset.create({ data: { userId: job.userId, storageKey: `assets/${job.userId}/${randomUUID()}.webp`, sha256: hash, width: sanitized.width, height: sanitized.height, bytes: data!.length, provenance: `ai:${snapshot.model}` } });
          await tx.generationJob.update({ where: { id }, data: { assetId: created.id } }); return created;
        });
      }
      const readyAsset = asset!;
      await prisma.$transaction(async tx => {
        await fence(tx, id, token);
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM assets WHERE id = ${readyAsset.id} AND status = 'processing' FOR UPDATE`;
        if (!rows.length) throw new Error('Image checkpoint is unavailable');
        await storage.put(readyAsset.storageKey, data!, 'image/webp');
        await tx.asset.update({ where: { id: readyAsset.id }, data: { status: 'ready' } });
        await tx.assetReference.create({ data: { assetId: readyAsset.id, bookId: job.bookId } });
        await tx.generationJob.update({ where: { id }, data: { progress: 1, creditsCharged: job.creditsReserved } });
        await finishJob(tx, id, 'completed');
      }, { timeout: 60000 });
    } catch (err) {
      if (err instanceof LeaseLost) return;
      if (!(err instanceof GenerationCancelled)) logger.error({ err: safeError(err), jobId: id }, 'Image generation failed');
      try { await finishOwned(id, token, err instanceof GenerationCancelled ? 'cancelled' : 'failed', err instanceof GenerationCancelled ? undefined : 'Image generation failed. Reserved credits were returned. Previous artwork is unchanged.'); }
      catch (error) { if (!(error instanceof LeaseLost)) throw error; }
    } finally { stop(); }
  },
};

/**
 * The parts of a failure that are safe to log. Provider SDK errors carry
 * request/response metadata; only the name, a bounded message, the HTTP status,
 * the error code and the provider request id are kept, never headers or bodies.
 */
export function safeError(err: unknown) {
  const e = (err ?? {}) as { name?: unknown; message?: unknown; status?: unknown; code?: unknown; requestID?: unknown; stack?: unknown };
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : undefined);
  return {
    name: text(e.name, 100) ?? 'Error',
    message: (text(e.message, 500) ?? String(err).slice(0, 500)).replace(/\b(sk|rk)-[A-Za-z0-9_-]{8,}/g, '[redacted]'),
    status: typeof e.status === 'number' ? e.status : undefined,
    code: typeof e.code === 'string' || typeof e.code === 'number' ? e.code : undefined,
    requestId: text(e.requestID, 200),
    stack: text(e.stack, 2000)?.replace(/\b(sk|rk)-[A-Za-z0-9_-]{8,}/g, '[redacted]'),
  };
}
