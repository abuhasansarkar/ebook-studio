import { Router, raw } from 'express';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { userId } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import { assetService, MAX_IMAGE_BYTES } from '../services/assets/assetService.js';
import { badRequest } from '../utils/errors.js';
export const assetRouter = Router();
assetRouter.get('/assets', async (req, res) => {
  const cursor = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional().safeParse(req.query.cursor);
  if (!cursor.success) throw badRequest('Invalid image page.');
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(await assetService.list(userId(req), cursor.data));
});
assetRouter.post('/assets', raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: MAX_IMAGE_BYTES, inflate: false }), async (req, res) => {
  res.status(201).json({ asset: await assetService.upload(userId(req), req.body, req.get('content-type')?.split(';')[0] ?? '') });
});
assetRouter.get('/assets/:id/content', async (req, res) => {
  const { stream, size } = await assetService.content(userId(req), String(req.params.id));
  res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' });
  if (size !== undefined) res.setHeader('Content-Length', size);
  try { await pipeline(stream, res); } catch { if (!res.destroyed) res.destroy(); }
});
assetRouter.patch('/assets/:id', validateBody(z.object({ alt: z.string().trim().max(500), caption: z.string().trim().max(1000) })), async (req, res) => {
  res.json({ asset: await assetService.update(userId(req), String(req.params.id), req.body) });
});
assetRouter.delete('/assets/:id', async (req, res) => {
  await assetService.remove(userId(req), String(req.params.id)); res.status(204).end();
});
