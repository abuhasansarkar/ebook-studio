import { Router } from "express";
import {
  LISTING_PROFILES,
  prepareListingSchema,
  royaltyQuoteSchema,
  updateListingSchema,
  type DistributionDestination,
} from "@ebook/shared";
import { userId } from "../middleware/requireAuth.js";
import { validateBody } from "../middleware/validate.js";
import {
  getListing,
  listListings,
  listingGaps,
  prepareListing,
  quoteRoyalty,
  updateListing,
} from "../services/publishing/listingService.js";

export const listingRouter = Router();

/**
 * Marketplace listing copy.
 *
 * The product drafts the text a store's own form asks for and calculates what
 * the author would keep at the price they chose. No store API is called from
 * anywhere in this file: the author submits the listing themselves.
 */

/** The listing fields each destination asks for, and its published rate. */
listingRouter.get("/listings/destinations", async (_req, res) => {
  res.json({
    destinations: Object.entries(LISTING_PROFILES).map(([destination, profile]) => ({
      destination: destination as DistributionDestination,
      fields: profile.fields,
      royaltyRate: profile.royaltyRate,
      royaltyNote: profile.royaltyNote,
      source: profile.source,
      taxHandling: profile.taxHandling,
    })),
  });
});

/**
 * The royalty estimate for a price.
 *
 * A pure calculation. It costs nothing, so the author can move a price
 * around without spending credits.
 */
listingRouter.post("/listings/royalty-quote", validateBody(royaltyQuoteSchema), async (req, res) => {
  res.json({ quote: quoteRoyalty(req.body.destination, req.body.priceInMinorUnits) });
});

/** The listings for a book. */
listingRouter.get("/listings/books/:bookId", async (req, res) => {
  res.json({ listings: await listListings(userId(req), String(req.params.bookId)) });
});

/**
 * Prepares a listing for a destination.
 *
 * The listing is drafted from the author's own manuscript. It is not
 * submitted anywhere.
 */
listingRouter.post("/listings/books/:bookId", validateBody(prepareListingSchema), async (req, res) => {
  const result = await prepareListing(userId(req), String(req.params.bookId), req.body);
  res.status(201).json({ listing: result });
});

/** One listing. */
listingRouter.get("/listings/:listingId", async (req, res) => {
  res.json({ listing: await getListing(userId(req), String(req.params.listingId)) });
});

/**
 * The fields a listing is still missing, and whether it is stale.
 *
 * A stale listing describes a manuscript that has moved on since it was
 * drafted.
 */
listingRouter.get("/listings/:listingId/gaps", async (req, res) => {
  res.json(await listingGaps(userId(req), String(req.params.listingId)));
});

/**
 * Saves an edited listing.
 *
 * The version is checked, so a lost edit is refused rather than overwriting
 * a newer save.
 */
listingRouter.patch("/listings/:listingId", validateBody(updateListingSchema), async (req, res) => {
  const listing = await updateListing(userId(req), String(req.params.listingId), req.body);
  res.json({ listing });
});
