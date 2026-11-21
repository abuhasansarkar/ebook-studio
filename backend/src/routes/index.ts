import { coverRouter } from './covers.js';
import { billingRouter } from './billing.js';
import { designRouter } from './design.js';
import { qualityRouter } from './quality.js';
import { sourceRouter } from './sources.js';
import { assetRouter } from './assets.js';
import { adminRouter } from './admin.js';
import { supportRouter } from './support.js';
import { distributionRouter } from './distribution.js';
import { listingRouter } from './listing.js';
import { marketingRouter } from './marketing.js';
import { outlineService } from "../services/outline/outlineService.js";
import { libraryQuerySchema, projectSchema, bookOrganizationSchema } from "@ebook/shared";
import { libraryService } from "../services/books/libraryService.js";
import { MARKETPLACES } from "@ebook/shared";
import { publishingReport } from "../services/publishing/publishingService.js";
import { paginationSchema } from "@ebook/shared";
import { operationService } from "../services/operations/operationService.js";
import { userId } from "../middleware/requireAuth.js";
import { badRequest } from "../utils/errors.js";
import { z } from "zod";
import { Router } from "express";
import { assistSchema, bookBriefSchema, createBookSchema, outlineSchema, updateChapterSchema } from "@ebook/shared";
import { accountController, createProjectSchema } from "../controllers/accountController.js";
import { bookController } from "../controllers/bookController.js";
import { chapterController } from "../controllers/chapterController.js";
import { createExportSchema, exportController } from "../controllers/exportController.js";
import { generationController } from "../controllers/generationController.js";
import { outlineController } from "../controllers/outlineController.js";
import { healthController } from "../controllers/healthController.js";
import { aiLimiter } from "../middleware/rateLimits.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateBody } from "../middleware/validate.js";

export const apiRouter = Router();

// ---- Public ----
apiRouter.get("/health/live", healthController.live);
apiRouter.get("/health/ready", healthController.ready);
apiRouter.get("/health", healthController.check);
apiRouter.get("/config", accountController.publicConfig);

// ---- Everything below requires a verified session ----
apiRouter.use(requireAuth);
apiRouter.use(assetRouter);
apiRouter.use(adminRouter);
apiRouter.use(supportRouter);
apiRouter.use(billingRouter);
apiRouter.use(coverRouter);
apiRouter.use(designRouter);
apiRouter.use(qualityRouter);
apiRouter.use(sourceRouter);
apiRouter.use(distributionRouter);
apiRouter.use(listingRouter);
apiRouter.use(marketingRouter);

apiRouter.get("/operations/:operationId", async (req, res) => {
  res.json({ operation: await operationService.get(userId(req), String(req.params.operationId)) });
});
apiRouter.get("/books/:bookId/operations", async (req, res) => {
  const query = paginationSchema.safeParse(req.query);
  if (!query.success) throw badRequest("Invalid pagination parameters.");
  res.json(await operationService.list(userId(req), String(req.params.bookId), query.data.limit, query.data.cursor));
});

apiRouter.get("/users/me", accountController.me);
apiRouter.get("/users/me/dashboard", bookController.dashboard);
apiRouter.get("/credits", accountController.credits);

apiRouter.get("/projects", async (req, res) => {
  const query = libraryQuerySchema.safeParse(req.query);
  if (!query.success) throw badRequest('Invalid project filters.');
  res.json(await libraryService.projects(userId(req), query.data));
});
apiRouter.patch('/projects/:projectId', validateBody(z.object({ name: projectSchema.shape.name.optional(), description: z.string().trim().max(1000).optional(), archived: z.boolean().optional() }).refine(v => Object.keys(v).length > 0, 'Choose a change')), async (req, res) => {
  res.json({ project: await libraryService.updateProject(userId(req), String(req.params.projectId), req.body) });
});
apiRouter.post("/projects", validateBody(createProjectSchema), accountController.createProject);
apiRouter.delete('/projects/:projectId', async (req, res) => {
  await libraryService.deleteProject(userId(req), String(req.params.projectId)); res.status(204).end();
});

apiRouter.get('/books', async (req, res) => {
  const query = libraryQuerySchema.safeParse(req.query);
  if (!query.success) throw badRequest('Invalid library filters.');
  res.json(await libraryService.list(userId(req), query.data));
});
apiRouter.patch('/books/:bookId', validateBody(bookOrganizationSchema), async (req, res) => {
  res.json({ book: await libraryService.organize(userId(req), String(req.params.bookId), req.body) });
});
apiRouter.post('/books/:bookId/duplicate', validateBody(z.object({ includeManuscript: z.boolean() })), async (req, res) => {
  res.status(201).json({ book: await libraryService.duplicate(userId(req), String(req.params.bookId), req.body.includeManuscript) });
});
apiRouter.post("/books", aiLimiter, validateBody(createBookSchema), bookController.create);
apiRouter.get("/books/:bookId", bookController.get);
apiRouter.delete("/books/:bookId", bookController.remove);
apiRouter.put("/books/:bookId/brief", validateBody(bookBriefSchema), bookController.updateBrief);

apiRouter.get('/books/:bookId/outlines', async (req, res) => {
  const before = z.coerce.number().int().positive().optional().safeParse(req.query.before);
  if (!before.success) throw badRequest('Invalid outline page.');
  res.json(await outlineService.history(userId(req), String(req.params.bookId), before.data));
});
apiRouter.get('/books/:bookId/outlines/:version', async (req, res) => {
  const version = z.coerce.number().int().positive().safeParse(req.params.version);
  if (!version.success) throw badRequest('Invalid outline version.');
  res.json({ outline: await outlineService.detail(userId(req), String(req.params.bookId), version.data) });
});
apiRouter.post('/books/:bookId/outlines/:version/restore', validateBody(z.object({ baseVersion: z.number().int().positive() })), async (req, res) => {
  const version = z.coerce.number().int().positive().safeParse(req.params.version);
  if (!version.success) throw badRequest('Invalid outline version.');
  res.json({ outline: await outlineService.restore(userId(req), String(req.params.bookId), version.data, req.body.baseVersion) });
});

apiRouter.post("/books/:bookId/outline/generate", aiLimiter, outlineController.generate);
apiRouter.put("/books/:bookId/outline", validateBody(outlineSchema.extend({ baseVersion: z.number().int().min(0) })), outlineController.update);
apiRouter.post("/books/:bookId/outline/approve", validateBody(z.object({ version: z.number().int().positive() })), outlineController.approve);

apiRouter.post("/books/:bookId/generate", aiLimiter, generationController.start);
apiRouter.post("/books/:bookId/generate/retry", aiLimiter, generationController.start);
apiRouter.post("/books/:bookId/generate/cancel", generationController.cancel);
apiRouter.get("/generation-jobs/:jobId", generationController.getJob);

apiRouter.get("/books/:bookId/chapters", chapterController.listForBook);
apiRouter.get("/chapters/:chapterId", chapterController.get);
apiRouter.patch("/chapters/:chapterId", validateBody(updateChapterSchema), chapterController.update);

apiRouter.get("/chapters/:chapterId/versions", chapterController.listVersions);
apiRouter.get("/chapters/:chapterId/versions/:versionId", chapterController.getVersion);
apiRouter.post("/chapters/:chapterId/versions/:versionId/restore", validateBody(z.object({ version: z.number().int().min(0) })), chapterController.restoreVersion);

apiRouter.post("/ai/assist", aiLimiter, validateBody(assistSchema), chapterController.assist);

apiRouter.get("/books/:bookId/publishing-checks", async (req, res) => {
  const destination = z.enum(MARKETPLACES).safeParse(req.query.destination);
  if (!destination.success) throw badRequest("Choose a supported publishing destination.");
  res.json({ report: await publishingReport(userId(req), String(req.params.bookId), destination.data) });
});

apiRouter.get("/books/:bookId/exports", exportController.list);
apiRouter.post("/books/:bookId/exports", validateBody(createExportSchema), exportController.create);
apiRouter.get("/exports/formats", exportController.formats);
apiRouter.get("/exports/:exportId", exportController.detail);
apiRouter.get("/exports/:exportId/download", exportController.download);
