import { Router } from 'express';
import { z } from 'zod';
import { FONT_FACE_IDS, TEMPLATE_IDS, bookDesignSchema } from '@ebook/shared';
import { userId } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import { badRequest } from '../utils/errors.js';
import { designService } from '../services/design/designService.js';
import { fontRegistry } from '../services/design/fonts.js';
import { previewService } from '../services/design/previewService.js';

export const designRouter = Router();
const version = z.coerce.number().int().min(0).max(1_000_000);

designRouter.get('/design/templates', (_req, res) => { res.json({ templates: designService.templates() }); });
designRouter.get('/design/capabilities', async (_req, res) => { res.json(await designService.capabilities()); });
// Pinned, hash-verified bytes: safe to cache. Same-origin previews load these with the session cookie.
designRouter.get('/design-fonts/:font', async (req, res) => {
  const id = String(req.params.font);
  if (!FONT_FACE_IDS.includes(id)) throw badRequest('Unknown font');
  res.set({ 'Content-Type': 'font/ttf', 'Cache-Control': 'private, max-age=604800, immutable', 'X-Content-Type-Options': 'nosniff' }).send(await fontRegistry.bytes(id));
});
designRouter.get('/books/:bookId/design', async (req, res) => {
  const requested = req.query.version === undefined ? undefined : version.safeParse(req.query.version);
  if (requested && !requested.success) throw badRequest('Invalid design version');
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ design: await designService.get(userId(req), String(req.params.bookId), requested?.data) });
});
designRouter.get('/books/:bookId/design/versions', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(await designService.history(userId(req), String(req.params.bookId)));
});
designRouter.put('/books/:bookId/design', validateBody(z.object({ baseVersion: version, data: bookDesignSchema }).strict()), async (req, res) => {
  res.json({ design: await designService.save(userId(req), String(req.params.bookId), req.body.baseVersion, req.body.data) });
});
designRouter.post('/books/:bookId/design/apply-template', validateBody(z.object({ baseVersion: version, templateId: z.enum(TEMPLATE_IDS), templateVersion: z.number().int().positive() }).strict()), async (req, res) => {
  res.json({ design: await designService.applyTemplate(userId(req), String(req.params.bookId), req.body.baseVersion, req.body.templateId, req.body.templateVersion) });
});
designRouter.post('/books/:bookId/design/restore', validateBody(z.object({ baseVersion: version, version }).strict()), async (req, res) => {
  res.json({ design: await designService.restore(userId(req), String(req.params.bookId), req.body.baseVersion, req.body.version) });
});
/** Renders a saved version, or an unsaved draft design, without persisting anything. */
designRouter.post('/books/:bookId/design/preview', validateBody(z.object({ mode: z.enum(['reader', 'print']), version: version.optional(), data: bookDesignSchema.optional() }).strict().refine(v => !(v.version !== undefined && v.data), 'Preview either a saved version or a draft')), async (req, res) => {
  const source = { version: req.body.version, draft: req.body.data };
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.body.mode === 'reader') return void res.json(await previewService.reader(userId(req), String(req.params.bookId), source));
  const pdf = await previewService.print(userId(req), String(req.params.bookId), source);
  res.set({
    'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="print-sample.pdf"',
    'X-Page-Count': String(pdf.pageCount), 'X-Sample-Chapters': String(pdf.chapters), 'X-Sample-Partial': String(pdf.partial),
    'X-Fallback-Fonts': encodeURIComponent(pdf.foreignFonts.join(',')), 'X-Layout-Overflow': encodeURIComponent(pdf.overflow.join('\n')), 'X-Type3-Fonts': encodeURIComponent(pdf.type3Fonts.join(',')),
  }).send(pdf.buffer);
});
