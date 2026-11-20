import { Router } from 'express';
import { z } from 'zod';
import { aiReviewRequestSchema, bookContextSchema, findingReviewSchema } from '@ebook/shared';
import { userId } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimits.js';
import { unauthorized } from '../utils/errors.js';
import { submitOperation } from '../services/operations/operationService.js';
import { aiReviewService, contextService, qualityService } from '../services/quality/qualityService.js';

export const qualityRouter = Router();
const noStore = { 'Cache-Control': 'private, no-store' };

qualityRouter.get('/quality/config', (_req, res) => { res.json(qualityService.config()); });
qualityRouter.get('/books/:bookId/quality/context', async (req, res) => { res.set(noStore).json({ context: await contextService.get(userId(req), String(req.params.bookId)) }); });
qualityRouter.put('/books/:bookId/quality/context', validateBody(z.object({ baseVersion: z.number().int().min(0), data: bookContextSchema }).strict()), async (req, res) => {
  res.json({ context: await contextService.save(userId(req), String(req.params.bookId), req.body.baseVersion, req.body.data) });
});
qualityRouter.get('/books/:bookId/quality/reports', async (req, res) => { res.set(noStore).json(await qualityService.list(userId(req), String(req.params.bookId))); });
/** Free deterministic checks. Returns the existing report when its inputs are unchanged. */
qualityRouter.post('/books/:bookId/quality/reports', validateBody(z.object({}).strict()), async (req, res) => {
  const result = await qualityService.runRules(userId(req), String(req.params.bookId));
  res.status(result.reused ? 200 : 201).json(result);
});
qualityRouter.get('/books/:bookId/quality/reports/:reportId', async (req, res) => {
  res.set(noStore).json(await qualityService.get(userId(req), String(req.params.bookId), String(req.params.reportId)));
});
/** Costed AI review: idempotent operation with credit reservation; findings arrive as a new report. */
qualityRouter.post('/books/:bookId/quality/ai-reviews', aiLimiter, validateBody(aiReviewRequestSchema), async (req, res) => {
  const bookId = String(req.params.bookId);
  await submitOperation(req, res, userId(req), 'quality_review', bookId, async () => ({ status: 202, body: await aiReviewService.request(userId(req), bookId, req.body) }));
});
qualityRouter.post('/books/:bookId/quality/ai-reviews/:jobId/cancel', async (req, res) => {
  await aiReviewService.cancel(userId(req), String(req.params.bookId), String(req.params.jobId)); res.status(204).end();
});
qualityRouter.get('/quality/findings/:findingId', async (req, res) => { res.set(noStore).json({ finding: await qualityService.finding(userId(req), String(req.params.findingId)) }); });
qualityRouter.patch('/quality/findings/:findingId', validateBody(findingReviewSchema), async (req, res) => {
  if (!req.user) throw unauthorized();
  res.json({ finding: await qualityService.review({ id: req.user.id, name: req.user.name }, String(req.params.findingId), req.body) });
});
