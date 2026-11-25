import { pipeline } from "node:stream/promises";
import { Router } from "express";
import { distributionPackageSchema, publishingStatusSchema } from "@ebook/shared";
import { userId } from "../middleware/requireAuth.js";
import { validateBody } from "../middleware/validate.js";
import { aiLimiter } from "../middleware/rateLimits.js";
import {
  destinationProfiles,
  getPackage,
  getPackageForDownload,
  listPackages,
  listPublishingStatus,
  preparePackage,
  setPublishingStatus,
} from "../services/publishing/distributionService.js";
import { notFound } from "../utils/errors.js";

export const distributionRouter = Router();

/**
 * S14 — distribution packages.
 *
 * The product assembles a ZIP the author uploads to a store themselves. It
 * never publishes on the author's behalf, and no route here claims a store
 * accepted anything.
 */

/** The destinations a package can be prepared for, and the rules each applies. */
distributionRouter.get("/distribution/destinations", async (_req, res) => {
  res.json({ destinations: destinationProfiles() });
});

/** The packages for a book. */
distributionRouter.get("/distribution/books/:bookId/packages", async (req, res) => {
  const id = userId(req);
  res.json({ packages: await listPackages(id, String(req.params.bookId)) });
});

/**
 * Prepares a package.
 *
 * A package that cannot satisfy the destination's rules is recorded as
 * blocked and refused, rather than assembled and downloaded.
 */
distributionRouter.post("/distribution/books/:bookId/packages", aiLimiter, validateBody(distributionPackageSchema), async (req, res) => {
  const id = userId(req);
  const result = await preparePackage(id, String(req.params.bookId), req.body);
  res.status(result.status === "blocked" ? 422 : 201).json({ package: result });
});

/** One package, with its checks. */
distributionRouter.get("/distribution/packages/:packageId", async (req, res) => {
  const id = userId(req);
  res.json({ package: await getPackage(id, String(req.params.packageId)) });
});

/** The ZIP of a package. */
distributionRouter.get("/distribution/packages/:packageId/download", async (req, res) => {
  const id = userId(req);
  const file = await getPackageForDownload(id, String(req.params.packageId));
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  if (file.size !== undefined) res.setHeader("Content-Length", String(file.size));
  await pipeline(file.stream, res);
});

/**
 * The author's own publishing status for a destination.
 *
 * The author sets this; the product records it. Only the author knows whether
 * a store accepted the book.
 */
distributionRouter.get("/distribution/books/:bookId/publishing-status", async (req, res) => {
  const id = userId(req);
  res.json({ statuses: await listPublishingStatus(id, String(req.params.bookId)) });
});

distributionRouter.post("/distribution/books/:bookId/publishing-status", validateBody(publishingStatusSchema), async (req, res) => {
  const id = userId(req);
  const status = await setPublishingStatus(id, String(req.params.bookId), req.body);
  res.json({ status });
});
