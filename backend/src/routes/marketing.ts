import { Router } from "express";
import { marketingDraftSchema, marketingGraphicSchema, marketingSaveSchema, sampleChapterSchema } from "@ebook/shared";
import { userId } from "../middleware/requireAuth.js";
import { validateBody } from "../middleware/validate.js";
import {
  createDraft,
  getDraft,
  getGraphic,
  listDrafts,
  listGraphics,
  marketingCosts,
  regenerateDraft,
  saveDraft,
} from "../services/marketing/marketingService.js";
import {
  assembleSample,
  composeGraphic,
  listSamples,
  sampleForDownload,
} from "../services/marketing/marketingAssets.js";
import { notFound } from "../utils/errors.js";

export const marketingRouter = Router();

/**
 * S15 — the marketing studio.
 *
 * Everything here produces material the author downloads and uses
 * themselves. No route sends an email, posts to a social network or
 * publishes anywhere.
 */

/** The output types the studio can draft, and what each one costs. */
marketingRouter.get("/marketing/outputs", async (_req, res) => {
  res.json({ outputs: marketingCosts() });
});

/** The drafts for a book. */
marketingRouter.get("/marketing/books/:bookId/drafts", async (req, res) => {
  const id = userId(req);
  res.json({ drafts: await listDrafts(id, String(req.params.bookId)) });
});

/**
 * Drafts a piece of marketing material.
 *
 * The credit cost is shown before the request is made, so the author knows
 * what a draft costs before they spend it.
 */
marketingRouter.post("/marketing/books/:bookId/drafts", validateBody(marketingDraftSchema), async (req, res) => {
  const id = userId(req);
  const draft = await createDraft(id, String(req.params.bookId), req.body);
  res.status(201).json({ draft });
});

/** One draft, with its flags and whether the manuscript has moved on. */
marketingRouter.get("/marketing/drafts/:draftId", async (req, res) => {
  const id = userId(req);
  res.json({ draft: await getDraft(id, String(req.params.draftId)) });
});

/** Saves an edited draft. */
marketingRouter.patch("/marketing/drafts/:draftId", validateBody(marketingSaveSchema), async (req, res) => {
  const id = userId(req);
  const draft = await saveDraft(id, String(req.params.draftId), req.body);
  res.json({ draft });
});

/**
 * Regenerates a draft into a new variant.
 *
 * The existing draft is kept, so a manual edit is never overwritten.
 */
marketingRouter.post("/marketing/drafts/:draftId/regenerate", async (req, res) => {
  const id = userId(req);
  const draft = await regenerateDraft(id, String(req.params.draftId));
  res.status(201).json({ draft });
});

/** The promotional graphics for a book. */
marketingRouter.get("/marketing/books/:bookId/graphics", async (req, res) => {
  const id = userId(req);
  res.json({ graphics: await listGraphics(id, String(req.params.bookId)) });
});

/**
 * Composes a promotional graphic.
 *
 * The image is rendered locally and stored privately. The graphic is a file
 * the author downloads; nothing is posted or published anywhere.
 */
marketingRouter.post("/marketing/books/:bookId/graphics", validateBody(marketingGraphicSchema), async (req, res) => {
  const id = userId(req);
  const graphic = await composeGraphic(id, String(req.params.bookId), req.body);
  res.status(201).json({ graphic });
});

/** One graphic. */
marketingRouter.get("/marketing/graphics/:graphicId", async (req, res) => {
  const id = userId(req);
  const graphic = await getGraphic(id, String(req.params.graphicId));
  if (!graphic) throw notFound("Graphic");
  res.json({ graphic });
});

/**
 * The sample packs for a book.
 *
 * A sample is a downloadable file the author hands out themselves. It is never
 * emailed, posted or sent to a store.
 */
marketingRouter.get("/marketing/books/:bookId/samples", async (req, res) => {
  const id = userId(req);
  res.json({ samples: await listSamples(id, String(req.params.bookId)) });
});

/**
 * Assembles a sample chapter pack from the chapters the author chose.
 *
 * The chapters must belong to the book and must be written. The file is
 * rendered and validated before it is offered, so a sample that would not
 * open is refused rather than offered as a download.
 */
marketingRouter.post("/marketing/books/:bookId/samples", validateBody(sampleChapterSchema), async (req, res) => {
  const id = userId(req);
  const sample = await assembleSample(id, String(req.params.bookId), req.body);
  res.status(201).json({ sample });
});

/**
 * Downloads a sample pack.
 *
 * The lookup is scoped to the owner, so one author cannot download another's
 * sample.
 */
marketingRouter.get("/marketing/samples/:sampleId/download", async (req, res) => {
  const id = userId(req);
  const file = await sampleForDownload(id, String(req.params.sampleId));
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Length", String(file.size));
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  file.stream.pipe(res);
});
