import { Router } from 'express';
import { z } from 'zod';
import { coverDesignSchema, imageRequestSchema, aiCoverRequestSchema } from '@ebook/shared';
import { env } from '../config/env.js';
import { userId } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimits.js';
import { badRequest } from '../utils/errors.js';
import { submitOperation } from '../services/operations/operationService.js';
import { coverFont, coverService } from '../services/covers/coverService.js';
import { imageGenerationService } from '../services/covers/imageGenerationService.js';
import { aiCoverService } from '../services/covers/aiCoverService.js';
export const coverRouter = Router();
coverRouter.get('/cover-fonts/:font', async (req, res) => {
  res.set({ 'Content-Type': 'font/ttf', 'Cache-Control': 'private, max-age=86400' }).send(await coverFont(String(req.params.font)));
});
coverRouter.get('/image-config', (_req, res) => res.json({ credits: env.IMAGE_GENERATION_CREDITS, model: env.OPENAI_IMAGE_MODEL, mock: env.AI_MOCK, enabled: env.AI_MOCK || !!env.OPENAI_API_KEY }));
coverRouter.get('/books/:bookId/cover', async (req, res) => {
  const version = z.coerce.number().int().positive().optional().safeParse(req.query.version);
  if (!version.success) throw badRequest('Invalid cover version');
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ cover: await coverService.get(userId(req), String(req.params.bookId), version.data) });
});
coverRouter.put('/books/:bookId/cover', validateBody(z.object({ baseVersion: z.number().int().min(0), data: coverDesignSchema })), async (req, res) => {
  res.json({ cover: await coverService.save(userId(req), String(req.params.bookId), req.body.baseVersion, req.body.data) });
});
coverRouter.get('/books/:bookId/cover/render', async (req, res) => {
  const version = z.coerce.number().int().positive().safeParse(req.query.version);
  if (!version.success) throw badRequest('Save the cover and select its version before downloading.');
  const bytes = await coverService.render(userId(req), String(req.params.bookId), version.data);
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'Content-Disposition': `attachment; filename="cover-v${version.data}.jpg"` }).send(bytes);
});
coverRouter.get('/books/:bookId/cover/versions', async (req, res) => {
  res.json({ versions: await coverService.versions(userId(req), String(req.params.bookId)) });
});
coverRouter.post('/books/:bookId/cover/restore', validateBody(z.object({ version: z.number().int().positive() })), async (req, res) => {
  res.json({ cover: await coverService.restore(userId(req), String(req.params.bookId), req.body.version) });
});
coverRouter.post('/books/:bookId/cover/ai-generate', aiLimiter, validateBody(aiCoverRequestSchema), async (req, res) => {
  const bookId = String(req.params.bookId);
  await submitOperation(req, res, userId(req), 'cover_ai_generate', bookId, async () => {
    const result = await aiCoverService.generate(userId(req), bookId, req.body);
    return { status: 201, body: { cover: { version: result.version, data: result.data }, assetId: result.assetId, plan: result.plan } };
  });
});
coverRouter.post('/books/:bookId/cover/ai-variations', aiLimiter, validateBody(aiCoverRequestSchema), async (req, res) => {
  const bookId = String(req.params.bookId);
  res.json(await aiCoverService.variations(userId(req), bookId, req.body));
});
coverRouter.post('/books/:bookId/images', aiLimiter, validateBody(imageRequestSchema), async (req, res) => {
  const bookId = String(req.params.bookId);
  await submitOperation(req, res, userId(req), 'image', bookId, async () => ({ status: 202, body: { job: await imageGenerationService.request(userId(req), bookId, req.body) } }));
});
coverRouter.get('/books/:bookId/images', async (req, res) => {
  const cursor = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional().safeParse(req.query.cursor);
  if (!cursor.success) throw badRequest('Invalid history page');
  res.json(await imageGenerationService.history(userId(req), String(req.params.bookId), cursor.data));
});
coverRouter.post('/books/:bookId/images/:jobId/cancel', async (req, res) => {
  await imageGenerationService.cancel(userId(req), String(req.params.bookId), String(req.params.jobId)); res.status(204).end();
});
