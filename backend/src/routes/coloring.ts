import { Router } from "express";
import {
  coloringBatchGenerateSchema,
  coloringBookBriefSchema,
  coloringCoverGenerateSchema,
  coloringPageCreateSchema,
  coloringPageGenerateSchema,
  coloringPageReorderSchema,
  coloringPageUpdateSchema,
  coloringPlanUpdateSchema,
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

coloringRouter.patch("/coloring/books/:bookId/plan", validateBody(coloringPlanUpdateSchema), async (req, res) => {
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

coloringRouter.post("/coloring/books/:bookId/pages", validateBody(coloringPageCreateSchema), async (req, res) => {
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

// ---- 3. Independent & Batch Page Generation & Auto-Clean ----
// Generation runs in the background: these return 202 with page statuses; clients poll the book.
coloringRouter.post(
  "/coloring/books/:bookId/pages/:pageId/generate",
  aiLimiter,
  validateBody(coloringPageGenerateSchema),
  async (req, res) => {
    const accepted = await coloringGenerationService.generatePage(
      userId(req),
      String(req.params.bookId),
      String(req.params.pageId),
      req.body.promptOverride || undefined,
    );
    res.status(202).json(accepted);
  },
);

coloringRouter.post("/coloring/books/:bookId/pages/:pageId/clean", aiLimiter, async (req, res) => {
  const updatedPage = await coloringGenerationService.autoCleanPage(
    userId(req),
    String(req.params.bookId),
    String(req.params.pageId),
  );
  res.json({ page: updatedPage });
});

// Each queued page is a separate paid job and counts against the per-user active-page cap.
coloringRouter.post(
  "/coloring/books/:bookId/generate-batch",
  aiLimiter,
  validateBody(coloringBatchGenerateSchema),
  async (req, res) => {
    const accepted = await coloringGenerationService.generateBatch(
      userId(req),
      String(req.params.bookId),
      req.body.pageIds,
    );
    res.status(202).json(accepted);
  },
);

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

coloringRouter.post("/coloring/books/:bookId/quality/auto-clean-all", aiLimiter, async (req, res) => {
  const result = await coloringGenerationService.autoCleanAll(userId(req), String(req.params.bookId));
  res.json(result);
});

coloringRouter.get("/coloring/books/:bookId/cover", async (req, res) => {
  const coverDetails = await coloringCoverService.getCoverDetails(userId(req), String(req.params.bookId));
  res.json(coverDetails);
});

coloringRouter.post(
  "/coloring/books/:bookId/cover",
  aiLimiter,
  validateBody(coloringCoverGenerateSchema.optional()),
  async (req, res) => {
    const result = await coloringCoverService.generateCover(userId(req), String(req.params.bookId), req.body);
    res.json(result);
  },
);

coloringRouter.get("/coloring/books/:bookId/export/package", async (req, res) => {
  const pkg = await coloringExportService.getPublishingPackage(userId(req), String(req.params.bookId));
  res.json(pkg);
});

coloringRouter.get("/coloring/books/:bookId/export/metadata", async (req, res) => {
  const pkg = await coloringExportService.getPublishingPackage(userId(req), String(req.params.bookId));
  const md = `# Amazon KDP Publishing Package: ${pkg.title}
${pkg.subtitle ? `*${pkg.subtitle}*\n` : ""}
## Amazon Search Keywords (7 Keywords)
${pkg.sevenKeywords.map((k, i) => `${i + 1}. ${k}`).join("\n")}

## Recommended Amazon Categories
${pkg.recommendedCategories.map((c) => `- ${c}`).join("\n")}

## Amazon HTML Product Description
\`\`\`html
${pkg.amazonDescriptionHtml}
\`\`\`

## Preflight Verification
- Trim Size: ${pkg.preflight.trimSize}
- Page Count: ${pkg.preflight.pageCount} physical pages
- Bleed: ${pkg.preflight.bleed ? "Bleed" : "No Bleed"}
- Single-Sided: ${pkg.preflight.singleSided ? "Yes (Blank backs)" : "Double-sided"}
- 300 DPI Compliant: ${pkg.preflight.dpi300Compliant ? "PASS" : "FAIL"}

## Step-by-Step Upload Instructions
${pkg.kdpUploadChecklist.join("\n")}
`;
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="KDP_METADATA_${req.params.bookId}.md"`);
  res.send(md);
});

coloringRouter.post("/coloring/books/:bookId/export/compile", async (req, res) => {
  const result = await coloringExportService.compilePdf(userId(req), String(req.params.bookId));
  res.json(result);
});

