import { z } from "zod";
import { DISTRIBUTION_DESTINATIONS, type DistributionDestination } from "./distribution";
/**
 * Marketplace listing copy and royalty estimation.
 *
 * Two things live here, and both are deliberately calculated rather than
 * invented:
 *
 * - The **listing fields** a store's own submission form asks for, per
 *   destination. The product fills them from the author's own manuscript and
 *   marks every field the author must confirm. It never claims a store will
 *   accept the listing.
 * - The **royalty estimate**, which applies the destination's published
 *   revenue share to a price the author chooses. The estimate names the rate
 *   it applied and where that rate came from, so the author can check it.
 *
 * The rates below are the stores' published headline rates. They are recorded
 * with the date they were read and the source they came from. A rate that
 * changes at the store is not automatically updated here, which is why the
 * date is part of the contract and is shown in the interface.
 */

/** The date the rates and the field rules below were read from the sources. */
export const LISTING_RULES_RETRIEVED = "2026-11-21";

/** The version of this ruleset. */
export const LISTING_RULES_VERSION = `2026-11-21.1`;

/**
 * The listing fields each destination asks for.
 *
 * `required` marks a field the store's form will not accept empty.
 * `maxLength` is the store's own limit, where the store publishes one.
 * `hint` tells the author what the field is for.
 */
export interface ListingFieldSpec {
  key: string;
  label: string;
  required: boolean;
  maxLength?: number;
  hint?: string;
}

export interface ListingProfile {
  /** The fields the destination's form asks for, in the order they appear. */
  fields: ListingFieldSpec[];
  /** The store's published revenue share, as a fraction. */
  royaltyRate: number;
  /** A plain statement of what that share means. */
  royaltyNote: string;
  /** Where the rate and the rules came from. */
  source: string;
  /** Whether the destination takes a percentage of the list price plus tax. */
  taxHandling: "excluded" | "included" | "varies";
}

const DESCRIPTION_FIELD: ListingFieldSpec = {
  key: "description",
  label: "Book description",
  required: true,
  maxLength: 4000,
  hint: "The text buyers read on the listing page. Say what the book is and who it is for.",
};

const TITLE_FIELD: ListingFieldSpec = {
  key: "title",
  label: "Title",
  required: true,
  maxLength: 200,
  hint: "The title as it appears on the cover.",
};

const SUBTITLE_FIELD: ListingFieldSpec = {
  key: "subtitle",
  label: "Subtitle",
  required: false,
  maxLength: 200,
  hint: "An optional line under the title.",
};

const AUTHOR_FIELD: ListingFieldSpec = {
  key: "author",
  label: "Author or pen name",
  required: true,
  maxLength: 100,
};

const KEYWORDS_FIELD: ListingFieldSpec = {
  key: "keywords",
  label: "Keywords",
  required: false,
  hint: "Search terms buyers use. Some stores index these separately from the description.",
};

const CATEGORIES_FIELD: ListingFieldSpec = {
  key: "categories",
  label: "Categories",
  required: false,
  hint: "Where the book sits in the store's catalogue.",
};

const AUDIENCE_FIELD: ListingFieldSpec = {
  key: "audience",
  label: "Audience and age range",
  required: false,
  hint: "Who the book is written for. Some stores ask for this separately.",
};

/**
 * The listing profiles.
 *
 * The rates are the published headline rates:
 * - KDP eBooks: 70% for eBooks priced between $2.99 and $9.99, 35% outside
 *   that band, and 50% for the $9.99 list price. The rate therefore depends
 *   on the price, which `estimateRoyalty` handles rather than a flat number.
 * - Etsy: the store takes a listing fee and a transaction fee, so there is no
 *   single revenue share. The estimate is therefore presented as the store's
 *   published fees rather than as a percentage.
 * - Gumroad: 10% of the price, plus a payment processing fee.
 * - Direct: no store takes a share, so the cost is only the payment processor.
 */
export const LISTING_PROFILES: Record<DistributionDestination, ListingProfile> = {
  kdp_ebook: {
    fields: [
      TITLE_FIELD,
      SUBTITLE_FIELD,
      AUTHOR_FIELD,
      DESCRIPTION_FIELD,
      KEYWORDS_FIELD,
      CATEGORIES_FIELD,
      AUDIENCE_FIELD,
    ],
    royaltyRate: 0.7,
    royaltyNote:
      "KDP pays 70% for an eBook priced between $2.99 and $9.99 inclusive, and 35% outside that band. The $9.99 list price pays 50%.",
    source: "https://kdp.amazon.com/en_US/help/topic/G200634390",
    taxHandling: "excluded",
  },
  kdp_print: {
    fields: [
      TITLE_FIELD,
      SUBTITLE_FIELD,
      AUTHOR_FIELD,
      DESCRIPTION_FIELD,
      CATEGORIES_FIELD,
      AUDIENCE_FIELD,
    ],
    royaltyRate: 0.6,
    royaltyNote:
      "KDP pays 60% of the list price for a paperback, minus the print costs it deducts for manufacturing and shipping.",
    source: "https://kdp.amazon.com/en_US/help/topic/G200634360",
    taxHandling: "excluded",
  },
  apple_books: {
    fields: [
      TITLE_FIELD,
      SUBTITLE_FIELD,
      AUTHOR_FIELD,
      DESCRIPTION_FIELD,
      CATEGORIES_FIELD,
      KEYWORDS_FIELD,
    ],
    royaltyRate: 0.7,
    royaltyNote:
      "Apple Books for Authors pays 70% of the proceeds for most books, and 85% for books in a series where the first volume is free.",
    source: "https://developer.apple.com/books/app/",
    taxHandling: "excluded",
  },
  etsy: {
    fields: [
      TITLE_FIELD,
      DESCRIPTION_FIELD,
      KEYWORDS_FIELD,
      AUDIENCE_FIELD,
    ],
    royaltyRate: 0,
    royaltyNote:
      "Etsy does not take a share of the sale. It charges a listing fee per listing and a transaction fee per sale, with the rates depending on the seller's location and the seller's plan.",
    source: "https://www.etsy.com/legal/fees/",
    taxHandling: "excluded",
  },
  gumroad: {
    fields: [
      TITLE_FIELD,
      SUBTITLE_FIELD,
      DESCRIPTION_FIELD,
      KEYWORDS_FIELD,
      CATEGORIES_FIELD,
    ],
    royaltyRate: 0.9,
    royaltyNote:
      "Gumroad keeps 10% of each sale, and payment processing is charged on top of that.",
    source: "https://gumroad.com/help/article/264-gumroad-fees",
    taxHandling: "excluded",
  },
  direct: {
    fields: [
      TITLE_FIELD,
      SUBTITLE_FIELD,
      AUTHOR_FIELD,
      DESCRIPTION_FIELD,
      KEYWORDS_FIELD,
      CATEGORIES_FIELD,
    ],
    royaltyRate: 1,
    royaltyNote:
      "Selling from your own site keeps the whole price, minus the payment processor's fee and your own hosting and marketing costs.",
    source: "https://stripe.com/pricing",
    taxHandling: "varies",
  },
};

/** The fields a listing carries. Every value is something the author can edit. */
export const listingCopySchema = z.object({
  destination: z.enum(DISTRIBUTION_DESTINATIONS),
  /** The price the author intends to charge, in the smallest currency unit. */
  priceInMinorUnits: z.number().int().min(0).max(100_000_00),
  /** The listing fields. A value is the text the product drafted or the author wrote. */
  fields: z.record(z.string(), z.string()),
}).strict();
export type ListingCopyInput = z.infer<typeof listingCopySchema>;

/**
 * The request to prepare a listing.
 *
 * Only the destination and the price are required. The fields are drafted
 * from the manuscript, and the author edits them afterwards.
 */
export const prepareListingSchema = z.object({
  destination: z.enum(DISTRIBUTION_DESTINATIONS),
  priceInMinorUnits: z.number().int().min(0).max(100_000_00),
}).strict();
export type PrepareListingInput = z.infer<typeof prepareListingSchema>;

/**
 * The request to save an edited listing.
 *
 * The version is required, so a lost edit is refused rather than overwriting
 * a newer save. The confirmed map records which fields the author has
 * checked, so an unconfirmed draft is visibly different from a finished one.
 */
export const updateListingSchema = z.object({
  baseVersion: z.number().int().min(1),
  priceInMinorUnits: z.number().int().min(0).max(100_000_00).optional(),
  fields: z.record(z.string(), z.string().max(8000)).optional(),
  confirmed: z.record(z.string(), z.boolean()).optional(),
}).strict();
export type UpdateListingInput = z.infer<typeof updateListingSchema>;

/**
 * The request for a royalty estimate.
 *
 * The estimate is a pure calculation and costs nothing, so it can be asked
 * for as often as the author likes while they move a price around.
 */
export const royaltyQuoteSchema = z.object({
  destination: z.enum(DISTRIBUTION_DESTINATIONS),
  priceInMinorUnits: z.number().int().min(0).max(100_000_00),
}).strict();
export type RoyaltyQuoteInput = z.infer<typeof royaltyQuoteSchema>;

/** One field in a returned listing, with its state. */
export interface ListingField {
  key: string;
  label: string;
  /** The current text, empty when the product could not draft one. */
  value: string;
  /** Whether the destination's form requires this field. */
  required: boolean;
  /** The store's own limit, when the store publishes one. */
  maxLength?: number;
  /** Whether the current value fits inside that limit. */
  withinLimit: boolean;
  /** Whether the author has confirmed the value. */
  confirmed: boolean;
  /** Why the field is empty, when it is. */
  note?: string;
}

/** The royalty estimate for a price. */
export interface RoyaltyEstimate {
  destination: DistributionDestination;
  /** The price the author chose, in the smallest currency unit. */
  priceInMinorUnits: number;
  /** The store's share of the price, in the smallest currency unit. */
  storeShareInMinorUnits: number;
  /** What the author keeps, in the smallest currency unit. */
  authorShareInMinorUnits: number;
  /** The share the author keeps, as a fraction. */
  authorShareRate: number;
  /** The rate that was applied, in words. */
  note: string;
  /** Where the rate came from. */
  source: string;
  /** A warning, when the price sits in a band that changes the rate. */
  warning?: string;
}

/** The complete listing for a destination. */
export interface ListingCopy {
  /** The listing's own id, used to address it in the API. */
  id: string;
  bookId: string;
  destination: DistributionDestination;
  rulesVersion: string;
  /** The version, used to refuse a lost edit. */
  version: number;
  /** The fields, in the order the destination's form asks for them. */
  fields: ListingField[];
  /** The royalty estimate for the price the author chose. */
  royalty: RoyaltyEstimate;
  /** The facts the drafts were written from, so a stale listing is visible. */
  sourceChapterVersions: { id: string; version: number }[];
  createdAt: string;
}

/**
 * The KDP eBook royalty rate for a price.
 *
 * KDP's rate depends on the band the price sits in, so it is a function rather
 * than a constant. The bands are the published ones: 70% between $2.99 and
 * $9.99 inclusive, 50% at the $9.99 list price, and 35% outside the band.
 *
 * The price is compared in cents rather than as a floating-point dollar
 * amount, because $9.99 is not exactly representable and an equality test on
 * the float would land in the wrong band.
 */
export function kdpEbookRate(priceInMinorUnits: number): number {
  const cents = Math.max(0, Math.round(priceInMinorUnits));
  // The $9.99 list price pays 50%, and it is checked first because it also
  // sits inside the 70% band.
  if (cents === 999) return 0.5;
  if (cents >= 299 && cents <= 999) return 0.7;
  return 0.35;
}

/**
 * Estimates what the author keeps at a given price.
 *
 * The calculation is the store's published share applied to the price. It is
 * an estimate of the store's cut only: it does not model currency conversion,
 * withholding tax, payment processing fees, refunds, or the advertising
 * spend a price may need, and it says so in the note it returns.
 */
export function estimateRoyalty(
  destination: DistributionDestination,
  priceInMinorUnits: number,
): RoyaltyEstimate {
  const profile = LISTING_PROFILES[destination];
  const price = Math.max(0, Math.round(priceInMinorUnits));

  if (destination === "kdp_ebook") {
    const rate = kdpEbookRate(price);
    const storeShare = Math.round(price * (1 - rate));
    const authorShare = price - storeShare;
    const warning =
      price !== 999 && price < 299
        ? "A price below $2.99 pays 35% rather than 70%."
        : price > 999
          ? "A price above $9.99 pays 35% rather than 70%."
          : undefined;
    return {
      destination,
      priceInMinorUnits: price,
      storeShareInMinorUnits: storeShare,
      authorShareInMinorUnits: authorShare,
      authorShareRate: rate,
      note:
        price === 999
          ? "The $9.99 list price pays 50%. A price between $2.99 and $9.98 pays 70%."
          : profile.royaltyNote,
      source: profile.source,
      warning,
    };
  }

  if (destination === "etsy") {
    // Etsy has no revenue share, so the "store share" is stated as the fees
    // rather than modelled, because the fees depend on the seller's plan and
    // location. A fixed estimate would be a guess.
    return {
      destination,
      priceInMinorUnits: price,
      storeShareInMinorUnits: 0,
      authorShareInMinorUnits: price,
      authorShareRate: 1,
      note:
        "Etsy charges a listing fee and a transaction fee rather than a share of the sale, and both depend on your location and your plan. The price above is what you would receive before those fees; check Etsy's current fee table for your own numbers.",
      source: profile.source,
      warning:
        "This estimate does not include the listing fee or the transaction fee, because both depend on your Etsy account.",
    };
  }

  const rate = profile.royaltyRate;
  const storeShare = Math.round(price * (1 - rate));
  const authorShare = price - storeShare;
  const warning =
    destination === "gumroad"
      ? "Payment processing is charged on top of Gumroad's 10%, so the amount you receive is lower than this figure."
      : destination === "direct"
        ? "Payment processing, hosting and marketing are not included in this figure."
        : undefined;

  return {
    destination,
    priceInMinorUnits: price,
    storeShareInMinorUnits: storeShare,
    authorShareInMinorUnits: authorShare,
    authorShareRate: rate,
    note: profile.royaltyNote,
    source: profile.source,
    warning,
  };
}

/**
 * Checks a field's value against the destination's own limit.
 *
 * A value that is too long is reported rather than truncated, because a
 * silently cut description reads as a finished listing.
 */
export function checkListingField(
  spec: ListingFieldSpec,
  value: string,
): { withinLimit: boolean; note?: string } {
  if (!spec.maxLength) return { withinLimit: true };
  if (value.length <= spec.maxLength) return { withinLimit: true };
  return {
    withinLimit: false,
    note: `This field is ${value.length - spec.maxLength} characters over the limit of ${spec.maxLength}.`,
  };
}

/**
 * The fields a listing is still missing.
 *
 * A required field with no value blocks the listing, because the store's own
 * form will not accept it.
 */
export function missingListingFields(
  destination: DistributionDestination,
  fields: Record<string, string>,
): ListingFieldSpec[] {
  return LISTING_PROFILES[destination].fields.filter(
    (spec) => spec.required && !(fields[spec.key] ?? "").trim(),
  );
}
