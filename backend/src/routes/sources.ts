import { Router, raw, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  MAX_SOURCE_BYTES,
  SOURCE_CONTENT_TYPES,
  SOURCE_FORMATS,
  applyImportSchema,
  createSourceSchema,
  linkSourceSchema,
  sourceQuestionSchema,
} from '@ebook/shared';
import { userId } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimits.js';
import { badRequest } from '../utils/errors.js';
import { researchService } from '../services/sources/researchService.js';
import { sourceService } from '../services/sources/sourceService.js';

export const sourceRouter = Router();

/** The formats this server can extract, with their accepted MIME types. */
sourceRouter.get('/sources/formats', (_req, res) => {
  res.json({
    formats: SOURCE_FORMATS.map((format) => ({ format, contentTypes: SOURCE_CONTENT_TYPES[format], maxBytes: MAX_SOURCE_BYTES })),
  });
});

sourceRouter.get('/books/:bookId/sources', async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store' });
  res.json({ sources: await sourceService.list(userId(req), String(req.params.bookId)) });
});

/**
 * Uploads a source. The body is raw bytes because the file itself is the payload;
 * the metadata travels in the query string so it is never confused with content.
 */
sourceRouter.post(
  '/books/:bookId/sources',
  // The body is the file itself, so it is read as raw bytes. The limit is the
  // shared upload limit; `inflate: false` stops a compressed body from
  // expanding past that limit.
  raw({ type: '*/*', limit: MAX_SOURCE_BYTES, inflate: false }),
  async (req: Request, res: Response) => {
    const meta = createSourceSchema.safeParse({
      title: req.query.title,
      format: req.query.format,
      provenance: req.query.provenance ?? '',
      license: req.query.license ?? '',
    });
    if (!meta.success) throw badRequest('Validation failed', meta.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    const mime = req.get('content-type')?.split(';')[0] ?? '';
    res.status(201).json(await sourceService.create(userId(req), String(req.params.bookId), meta.data, req.body, mime));
  },
  // An oversized body is refused by the body parser before the route runs. It is
  // reported as a rejected upload, not as a server fault.
  (err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: `The file is larger than ${Math.round(MAX_SOURCE_BYTES / (1024 * 1024))} MiB. Split it into smaller documents.` } });
      return;
    }
    next(err);
  },
);

sourceRouter.get('/sources/:sourceId', async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store' });
  res.json(await sourceService.get(userId(req), String(req.params.sourceId)));
});

sourceRouter.get('/sources/:sourceId/versions', async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store' });
  res.json({ versions: await sourceService.versions(userId(req), String(req.params.sourceId)) });
});

sourceRouter.get('/sources/:sourceId/passages', async (req, res) => {
  const version = z.coerce.number().int().positive().optional().safeParse(req.query.version);
  if (!version.success) throw badRequest('Invalid source version.');
  res.set({ 'Cache-Control': 'private, no-store' });
  res.json(await sourceService.passages(userId(req), String(req.params.sourceId), version.data));
});

/** The proposed chapter mapping the author confirms before anything is written. */
sourceRouter.get('/sources/:sourceId/preview', async (req, res) => {
  const version = z.coerce.number().int().positive().optional().safeParse(req.query.version);
  if (!version.success) throw badRequest('Invalid source version.');
  res.set({ 'Cache-Control': 'private, no-store' });
  res.json(await sourceService.preview(userId(req), String(req.params.sourceId), version.data));
});

sourceRouter.post('/sources/:sourceId/apply', validateBody(applyImportSchema), async (req, res) => {
  res.json(await sourceService.apply(userId(req), String(req.params.sourceId), req.body));
});

sourceRouter.post('/sources/:sourceId/links', validateBody(linkSourceSchema), async (req, res) => {
  res.json({ link: await sourceService.link(userId(req), String(req.params.sourceId), req.body) });
});

sourceRouter.get('/sources/:sourceId/links', async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store' });
  res.json({ links: await researchService.sourceLinks(userId(req), String(req.params.sourceId)) });
});

sourceRouter.delete('/sources/:sourceId', async (req, res) => {
  await sourceService.remove(userId(req), String(req.params.sourceId));
  res.status(204).end();
});

sourceRouter.get('/chapters/:chapterId/sources', async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store' });
  res.json(await researchService.chapterCitations(userId(req), String(req.params.chapterId)));
});

/** One cited passage, so a citation click opens the real supporting text. */
sourceRouter.get('/sources/:sourceId/passages/:locator', async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store' });
  res.json(await researchService.passage(userId(req), String(req.params.sourceId), String(req.params.locator)));
});

/** A question answered from the book's sources, with its supporting passages. */
sourceRouter.post('/books/:bookId/research/ask', aiLimiter, validateBody(sourceQuestionSchema), async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store' });
  res.json({ answer: await researchService.answer(userId(req), String(req.params.bookId), req.body) });
});

/** A summary of the book's sources, with its supporting passages. */
sourceRouter.post('/books/:bookId/research/summary', aiLimiter, validateBody(z.object({ sourceIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)).max(50).default([]) }).strict()), async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store' });
  res.json({ summary: await researchService.summarize(userId(req), String(req.params.bookId), req.body) });
});
