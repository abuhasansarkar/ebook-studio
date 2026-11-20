import { z } from "zod";
import { Router } from "express";
import { assistSchema, createBookSchema, outlineSchema, updateChapterSchema } from "@ebook/shared";
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
apiRouter.get("/health", healthController.check);
apiRouter.get("/config", accountController.publicConfig);

// ---- Everything below requires a verified session ----
apiRouter.use(requireAuth);

apiRouter.get("/users/me", accountController.me);
apiRouter.get("/users/me/dashboard", bookController.dashboard);
apiRouter.get("/credits", accountController.credits);

apiRouter.get("/projects", accountController.listProjects);
apiRouter.post("/projects", validateBody(createProjectSchema), accountController.createProject);
apiRouter.delete("/projects/:projectId", accountController.deleteProject);

apiRouter.get("/books", bookController.list);
apiRouter.post("/books", aiLimiter, validateBody(createBookSchema), bookController.create);
apiRouter.get("/books/:bookId", bookController.get);
apiRouter.delete("/books/:bookId", bookController.remove);
apiRouter.put("/books/:bookId/brief", bookController.updateBrief);

apiRouter.post("/books/:bookId/outline/generate", aiLimiter, outlineController.generate);
apiRouter.put("/books/:bookId/outline", validateBody(outlineSchema), outlineController.update);
apiRouter.post("/books/:bookId/outline/approve", outlineController.approve);

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

apiRouter.get("/books/:bookId/exports", exportController.list);
apiRouter.post("/books/:bookId/exports", validateBody(createExportSchema), exportController.create);
apiRouter.get("/exports/:exportId/download", exportController.download);
