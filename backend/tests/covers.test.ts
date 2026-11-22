import { afterAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { bookBriefSchema, defaultCover, coverDesignSchema } from '@ebook/shared';
import { prisma } from '../src/database/prisma.js';
import { env, imageModelSchema } from '../src/config/env.js';
import { closeQueues } from '../src/queues/index.js';
import { bookService } from '../src/services/books/bookService.js';
import { coverHtml, coverService } from '../src/services/covers/coverService.js';
import { imageGenerationService } from '../src/services/covers/imageGenerationService.js';
import { imageProvider } from '../src/services/covers/imageProvider.js';
import { assetService, sanitizeImage } from '../src/services/assets/assetService.js';
import { storage } from '../src/services/storage/storage.js';
import { closeBrowser } from '../src/services/exports/pdfRenderer.js';
import { logger } from '../src/utils/logger.js';
import { createUser, brief, ORIGIN } from './helpers.js';
const input = () => ({ purpose: 'cover' as const, aspect: 'portrait' as const, prompt: 'A peaceful illustrated mountain landscape', expectedCredits: env.IMAGE_GENERATION_CREDITS });
const png = () => sharp({ create: { width: 128, height: 192, channels: 3, background: '#335577' } }).png().toBuffer();
async function setup() {
  const user = await createUser('cover');
  const book = await bookService.create(user.user.id, bookBriefSchema.parse(brief().brief));
  return { ...user, book };
}
afterAll(async () => { await closeBrowser(); await closeQueues(); await prisma.$disconnect(); });

describe('cover studio and image generation', () => {
  it('requires ownership and OCC, retains cover artwork, and leaves historical versions unchanged', async () => {
    const a = await setup(); const b = await setup();
    const image = await assetService.upload(a.user.id, await png(), 'image/png');
    const cover = { ...defaultCover('Original title'), artworkId: image.id };
    await a.agent.put(`/api/v1/books/${a.book.id}/cover`).set('Origin', ORIGIN).send({ baseVersion: 0, data: cover }).expect(200);
    await a.agent.put(`/api/v1/books/${a.book.id}/cover`).send({ baseVersion: 0, data: cover }).expect(409);
    await b.agent.get(`/api/v1/books/${a.book.id}/cover`).expect(404);
    await b.agent.put(`/api/v1/books/${b.book.id}/cover`).send({ baseVersion: 0, data: cover }).expect(404);
    await b.agent.get(`/api/v1/books/${a.book.id}/images`).expect(404);
    await expect(assetService.remove(a.user.id, image.id)).rejects.toThrow('history');
    await coverService.save(a.user.id, a.book.id, 1, { ...cover, title: { ...cover.title, text: 'Changed title' } });
    expect((await coverService.get(a.user.id, a.book.id, 1)).data.title.text).toBe('Original title');
    expect((await coverService.get(a.user.id, a.book.id)).data.title.text).toBe('Changed title');
    expect(await prisma.generationJob.count({ where: { bookId: a.book.id } })).toBe(0);
  });
  it('reserves once for duplicate HTTP requests and settles only after sanitized artwork is saved', async () => {
    const a = await setup();
    const data = defaultCover('Art direction'); data.visual.palette = 'Blue and gold';
    await coverService.save(a.user.id, a.book.id, 0, data);
    const before = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: a.user.id } });
    const key = randomUUID();
    const first = await a.agent.post(`/api/v1/books/${a.book.id}/images`).set('Idempotency-Key', key).send(input()).expect(202);
    const replay = await a.agent.post(`/api/v1/books/${a.book.id}/images`).set('Idempotency-Key', key).send(input()).expect(202);
    expect(first.body.job.id).toBe(replay.body.job.id);
    await a.agent.post(`/api/v1/books/${a.book.id}/images`).set('Idempotency-Key', key).send({ ...input(), prompt: 'Changed request contents' }).expect(409);
    await imageGenerationService.process(first.body.job.id); await imageGenerationService.process(first.body.job.id);
    const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: first.body.job.id }, include: { asset: true } });
    expect(job.status).toBe('completed'); expect(job.asset?.status).toBe('ready'); expect(job.asset?.provenance).toContain('ai:');
    const after = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: a.user.id } });
    expect(after.balance).toBe(before.balance - input().expectedCredits); expect(after.reserved).toBe(0);
    const history = await imageGenerationService.history(a.user.id, a.book.id);
    expect(history.jobs).toHaveLength(1); expect(JSON.stringify(history.jobs[0].input)).toContain('Blue and gold');
    expect((await coverService.get(a.user.id, a.book.id)).data.artworkId).toBeNull();
  });
  it('rejects insufficient credits, changed pricing, arbitrary model fields and invalid cover bounds', async () => {
    expect(imageModelSchema.safeParse('gpt-image-1').success).toBe(false);
    expect(imageModelSchema.safeParse('gpt-image-2.6-sunburst').success).toBe(true);
    const a = await setup();
    await prisma.creditWallet.update({ where: { userId: a.user.id }, data: { balance: 0 } });
    await a.agent.post(`/api/v1/books/${a.book.id}/images`).send(input()).expect(402);
    await a.agent.post(`/api/v1/books/${a.book.id}/images`).send({ ...input(), expectedCredits: input().expectedCredits + 1 }).expect(409);
    await a.agent.post(`/api/v1/books/${a.book.id}/images`).send({ ...input(), model: 'arbitrary-model' }).expect(400);
    expect(await prisma.generationJob.count({ where: { bookId: a.book.id } })).toBe(0);
    const data = defaultCover('Text'); data.title.x = .9;
    expect(coverDesignSchema.safeParse(data).success).toBe(false);
    await a.agent.put(`/api/v1/books/${a.book.id}/cover`).send({ baseVersion: 0, data }).expect(400);
  });
  it('refunds queued cancellation without provider work and isolates cancellation ownership', async () => {
    const a = await setup(); const b = await setup();
    const job = await imageGenerationService.request(a.user.id, a.book.id, input());
    await b.agent.post(`/api/v1/books/${a.book.id}/images/${job.id}/cancel`).expect(404);
    await imageGenerationService.cancel(a.user.id, a.book.id, job.id);
    const generate = vi.spyOn(imageProvider, 'generate');
    await imageGenerationService.process(job.id); expect(generate).not.toHaveBeenCalled(); generate.mockRestore();
    expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('cancelled');
    expect((await prisma.creditWallet.findUniqueOrThrow({ where: { userId: a.user.id } })).reserved).toBe(0);
  });
  it('fences cancellation while the provider is running and returns reserved credits', async () => {
    const a = await setup(); const job = await imageGenerationService.request(a.user.id, a.book.id, input());
    let release!: (b: Buffer) => void; let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const generate = vi.spyOn(imageProvider, 'generate').mockImplementationOnce(() => { entered(); return new Promise<Buffer>(resolve => { release = resolve; }); });
    try {
      const processing = imageGenerationService.process(job.id); await started;
      await imageGenerationService.cancel(a.user.id, a.book.id, job.id); release(await png()); await processing;
      const result = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(result.status).toBe('cancelled'); expect(result.creditsCharged).toBe(0); expect(result.assetId).toBeNull();
    } finally { generate.mockRestore(); }
  });
  it('preserves previous concepts and the selected cover when regeneration times out', async () => {
    const a = await setup(); const first = await imageGenerationService.request(a.user.id, a.book.id, input()); await imageGenerationService.process(first.id);
    const original = await prisma.generationJob.findUniqueOrThrow({ where: { id: first.id } });
    await coverService.save(a.user.id, a.book.id, 0, { ...defaultCover('Keep this cover'), artworkId: original.assetId });
    const next = await imageGenerationService.request(a.user.id, a.book.id, input());
    const providerError = Object.assign(new Error('provider timeout for key sk-proj-ABCDEFGHIJKLMNOP'), { status: 504, headers: { authorization: 'Bearer secret' } });
    const generate = vi.spyOn(imageProvider, 'generate').mockRejectedValueOnce(providerError);
    const logged = vi.spyOn(logger, 'error');
    await imageGenerationService.process(next.id); generate.mockRestore();
    // The failure is logged, without provider headers or credentials.
    const entry = logged.mock.calls.find(([, message]) => message === 'Image generation failed');
    logged.mockRestore();
    expect(entry).toBeTruthy();
    const fields = entry![0] as unknown as { err: Record<string, unknown>; jobId: string };
    expect(fields.jobId).toBe(next.id);
    expect(fields.err).toMatchObject({ status: 504, message: 'provider timeout for key [redacted]' });
    expect(JSON.stringify(fields)).not.toMatch(/Bearer|sk-proj/);
    expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: next.id } })).status).toBe('failed');
    expect((await coverService.get(a.user.id, a.book.id)).data.artworkId).toBe(original.assetId);
    expect((await prisma.creditWallet.findUniqueOrThrow({ where: { userId: a.user.id } })).reserved).toBe(0);
  });
  it('resumes stored artwork after an expired lease without another provider request', async () => {
    const a = await setup(); const job = await imageGenerationService.request(a.user.id, a.book.id, input());
    const image = await sanitizeImage(await png(), 'image/png');
    const asset = await prisma.asset.create({ data: { userId: a.user.id, storageKey: `assets/${a.user.id}/${randomUUID()}.webp`, width: image.width, height: image.height, bytes: image.data.length, sha256: createHash('sha256').update(image.data).digest('hex'), provenance: 'ai:test' } });
    await storage.put(asset.storageKey, image.data, 'image/webp');
    await prisma.generationJob.update({ where: { id: job.id }, data: { assetId: asset.id, status: 'running', leaseToken: 'old', leaseExpiresAt: new Date(0) } });
    const generate = vi.spyOn(imageProvider, 'generate');
    await imageGenerationService.process(job.id); expect(generate).not.toHaveBeenCalled(); generate.mockRestore();
    expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('completed');
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).status).toBe('ready');
  });
  it('rejects a late image result after another worker acquires the expired lease', async () => {
    const a = await setup(); const job = await imageGenerationService.request(a.user.id, a.book.id, input());
    let release!: (b: Buffer) => void; let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const generate = vi.spyOn(imageProvider, 'generate').mockImplementationOnce(() => { entered(); return new Promise<Buffer>(resolve => { release = resolve; }); }).mockResolvedValueOnce(await png());
    try {
      const oldWorker = imageGenerationService.process(job.id); await started;
      await prisma.generationJob.update({ where: { id: job.id }, data: { leaseExpiresAt: new Date(0) } });
      await imageGenerationService.process(job.id);
      const completed = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
      release(await png()); await oldWorker;
      const final = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(final.assetId).toBe(completed.assetId); expect(final.status).toBe('completed');
      expect(await prisma.asset.count({ where: { userId: a.user.id, status: 'ready' } })).toBe(1);
      expect(await prisma.creditTransaction.count({ where: { userId: a.user.id, idempotencyKey: `settle:job:${job.id}` } })).toBe(1);
    } finally { generate.mockRestore(); }
  });
  it('escapes overlays and exports reproducible high-resolution covers with bundled multilingual fonts', async () => {
    const a = await setup(); let version = 0;
    for (const [language, title] of [['en', 'A practical guide'], ['bn', 'বাংলা বইয়ের প্রচ্ছদ'], ['ar', 'دليل عملي للقراءة'], ['hi', 'एक उपयोगी पुस्तक']]) {
      const data = defaultCover(title, '', '', language);
      const saved = await coverService.save(a.user.id, a.book.id, version, data); version = saved.version;
      const bytes = await coverService.render(a.user.id, a.book.id, version);
      const metadata = await sharp(bytes).metadata(); expect(metadata).toMatchObject({ width: 1600, height: 2560, format: 'jpeg' });
      expect(bytes.length).toBeGreaterThan(10000);
      if (language === 'en') expect(await coverService.render(a.user.id, a.book.id, version)).toEqual(bytes);
    }
    const malicious = defaultCover('<img src=x onerror=alert(1)>');
    const html = await coverHtml(malicious); expect(html).toContain('&lt;img'); expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('https://');
  });
  it('rejects overflowing typography instead of silently clipping the download', async () => {
    const a = await setup(); const data = defaultCover('Title'); data.title.text = 'Long title '.repeat(25); data.title.size = .15; data.title.height = .03;
    await coverService.save(a.user.id, a.book.id, 0, data);
    await expect(coverService.render(a.user.id, a.book.id, 1)).rejects.toThrow('does not fit');
    await a.agent.get(`/api/v1/books/${a.book.id}/cover/render?version=999`).expect(404);
  });
});
