import { Router } from "express";
import {
  coloringBookBriefSchema,
  coloringPageReorderSchema,
  coloringPageUpdateSchema,
} from "@ebook/shared";
import { userId } from "../middleware/requireAuth.js";
import { validateBody } from "../middleware/validate.js";
import { prisma } from "../database/prisma.js";
import { coloringPlanService } from "../services/coloring/coloringPlanService.js";
import { coloringGenerationService } from "../services/coloring/coloringGenerationService.js";
import { coloringCoverService } from "../services/coloring/coloringCoverService.js";
import { coloringExportService } from "../services/coloring/coloringExportService.js";
import { aiLimiter } from "../middleware/rateLimits.js";

export const coloringRouter = Router();

// ---- 1. Plan Management ----
coloringRouter.post("/coloring/plan", aiLimiter, validateBody(coloringBookBriefSchema), async (req, res) => {
  const result = await coloringPlanService.createPlan(userId(req), req.body);
  res.status(201).json(result);
});

coloringRouter.get("/coloring/books", async (req, res) => {
  const books = await prisma.book.findMany({
    where: {
      userId: userId(req),
      bookType: "coloring_book",
      deletedAt: null,
    },
    orderBy: { updatedAt: "desc" },
    include: {
      coloringPlan: true,
      _count: {
        select: {
          coloringPages: true,
        },
      },
    },
  });
  res.json({ books });
});

coloringRouter.get("/coloring/books/:bookId", async (req, res) => {
  const details = await coloringPlanService.getPlan(userId(req), String(req.params.bookId));
  res.json(details);
});

coloringRouter.patch("/coloring/books/:bookId/plan", async (req, res) => {
  const result = await coloringPlanService.updatePlan(userId(req), String(req.params.bookId), req.body);
  res.json(result);
});

// ---- 2. Page Management & Reordering ----
coloringRouter.patch(
  "/coloring/books/:bookId/pages/:pageId",
  validateBody(coloringPageUpdateSchema),
  async (req, res) => {
    const updated = await coloringPlanService.updatePage(
      userId(req),
      String(req.params.bookId),
      String(req.params.pageId),
      req.body,
    );
    res.json({ page: updated });
  },
);

coloringRouter.post(
  "/coloring/books/:bookId/pages/reorder",
  validateBody(coloringPageReorderSchema),
  async (req, res) => {
    const pages = await coloringPlanService.reorderPages(
      userId(req),
      String(req.params.bookId),
      req.body.pageIds,
    );
    res.json({ pages });
  },
);

coloringRouter.post("/coloring/books/:bookId/pages", async (req, res) => {
  const page = await coloringPlanService.addPage(userId(req), String(req.params.bookId), req.body);
  res.status(201).json({ page });
});

coloringRouter.delete("/coloring/books/:bookId/pages/:pageId", async (req, res) => {
  const result = await coloringPlanService.deletePage(
    userId(req),
    String(req.params.bookId),
    String(req.params.pageId),
  );
  res.json(result);
});

// ---- 3. Independent & Batch Page Generation ----
coloringRouter.post("/coloring/books/:bookId/pages/:pageId/generate", aiLimiter, async (req, res) => {
  const updatedPage = await coloringGenerationService.generatePage(
    userId(req),
    String(req.params.bookId),
    String(req.params.pageId),
    req.body?.promptOverride,
  );
  res.json({ page: updatedPage });
});

coloringRouter.post("/coloring/books/:bookId/generate-batch", aiLimiter, async (req, res) => {
  const results = await coloringGenerationService.generateBatch(
    userId(req),
    String(req.params.bookId),
    req.body?.pageIds,
  );
  res.json(results);
});

// ---- 4. Quality, Cover & Export ----
coloringRouter.get("/coloring/books/:bookId/quality", async (req, res) => {
  const details = await coloringPlanService.getPlan(userId(req), String(req.params.bookId));
  const pagesWithQuality = details.pages.map((p) => ({
    pageNumber: p.pageNumber,
    title: p.title,
    status: p.status,
    assetId: p.assetId,
    quality: p.qualityChecks,
  }));
  res.json({
    bookId: details.book.id,
    stats: details.stats,
    pages: pagesWithQuality,
  });
});

coloringRouter.get("/coloring/books/:bookId/cover", async (req, res) => {
  const coverDetails = await coloringCoverService.getCoverDetails(userId(req), String(req.params.bookId));
  res.json(coverDetails);
});

coloringRouter.get("/coloring/books/:bookId/export/package", async (req, res) => {
  const pkg = await coloringExportService.getPublishingPackage(userId(req), String(req.params.bookId));
  res.json(pkg);
});

coloringRouter.post("/coloring/books/:bookId/export/compile", async (req, res) => {
  const result = await coloringExportService.compilePdf(userId(req), String(req.params.bookId));
  res.json(result);
});
