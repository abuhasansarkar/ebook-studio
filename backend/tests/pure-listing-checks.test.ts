import { describe, expect, it } from "vitest";
import {
  LISTING_PROFILES,
  checkListingField,
  estimateRoyalty,
  kdpEbookRate,
  missingListingFields,
} from "@ebook/shared";

/**
 * The royalty estimate and the listing field rules.
 *
 * These are pure calculations, so they are pinned without a database. The
 * rules that matter here are that the rate depends on the price band, that a
 * price is compared in cents rather than as a floating-point dollar amount,
 * and that a field over the store's limit is reported rather than truncated.
 */

describe("the KDP eBook royalty rate", () => {
  it("pays 70% between $2.99 and $9.99 inclusive", () => {
    expect(kdpEbookRate(299)).toBe(0.7);
    expect(kdpEbookRate(599)).toBe(0.7);
    expect(kdpEbookRate(998)).toBe(0.7);
  });

  it("pays 50% at the $9.99 list price", () => {
    expect(kdpEbookRate(999)).toBe(0.5);
  });

  it("pays 35% outside the band", () => {
    expect(kdpEbookRate(100)).toBe(0.35);
    expect(kdpEbookRate(298)).toBe(0.35);
    expect(kdpEbookRate(1299)).toBe(0.35);
  });

  it("does not treat $9.99 as part of the 70% band", () => {
    // $9.99 is inside the band's range and inside the list price. The list
    // price has to win, or the author is quoted 70% for a price that pays 50%.
    expect(kdpEbookRate(999)).not.toBe(0.7);
  });
});

describe("the royalty estimate", () => {
  it("applies the KDP band rate to the price", () => {
    const quote = estimateRoyalty("kdp_ebook", 599);
    expect(quote.priceInMinorUnits).toBe(599);
    expect(quote.authorShareRate).toBe(0.7);
    expect(quote.authorShareInMinorUnits).toBe(419);
    expect(quote.storeShareInMinorUnits).toBe(180);
  });

  it("warns when a KDP price falls below the 70% band", () => {
    expect(estimateRoyalty("kdp_ebook", 199).warning).toMatch(/below \$2\.99/i);
  });

  it("warns when a KDP price rises above the 70% band", () => {
    expect(estimateRoyalty("kdp_ebook", 1299).warning).toMatch(/above \$9\.99/i);
  });

  it("does not warn inside the band", () => {
    expect(estimateRoyalty("kdp_ebook", 499).warning).toBeUndefined();
  });

  it("names the list-price rate at $9.99", () => {
    expect(estimateRoyalty("kdp_ebook", 999).note).toMatch(/50%/);
  });

  it("keeps the whole price for a direct sale before the processing fee", () => {
    const quote = estimateRoyalty("direct", 1000);
    expect(quote.authorShareInMinorUnits).toBe(1000);
    expect(quote.storeShareInMinorUnits).toBe(0);
    expect(quote.warning).toMatch(/processing/i);
  });

  it("takes Gumroad's ten percent", () => {
    const quote = estimateRoyalty("gumroad", 1000);
    expect(quote.authorShareInMinorUnits).toBe(900);
    expect(quote.storeShareInMinorUnits).toBe(100);
  });

  it("does not model Etsy's fees as a share", () => {
    // Etsy's fees depend on the seller's plan and location, so a fixed
    // estimate would be a guess. The estimate says so instead.
    const quote = estimateRoyalty("etsy", 1000);
    expect(quote.authorShareInMinorUnits).toBe(1000);
    expect(quote.warning).toMatch(/listing fee/i);
  });

  it("treats a negative price as zero", () => {
    const quote = estimateRoyalty("kdp_ebook", -500);
    expect(quote.priceInMinorUnits).toBe(0);
    expect(quote.authorShareInMinorUnits).toBe(0);
  });

  it("names the source of the rate for every destination", () => {
    for (const destination of Object.keys(LISTING_PROFILES) as (keyof typeof LISTING_PROFILES)[]) {
      expect(estimateRoyalty(destination, 999).source).toMatch(/^https?:\/\//);
    }
  });
});

describe("the listing field rules", () => {
  it("reports a value that is over the store's limit", () => {
    const spec = LISTING_PROFILES.kdp_ebook.fields.find((field) => field.key === "description")!;
    const result = checkListingField(spec, "x".repeat(spec.maxLength! + 1));
    expect(result.withinLimit).toBe(false);
    expect(result.note).toMatch(/over the limit/);
  });

  it("accepts a value inside the limit", () => {
    const spec = LISTING_PROFILES.kdp_ebook.fields.find((field) => field.key === "description")!;
    expect(checkListingField(spec, "x".repeat(10)).withinLimit).toBe(true);
  });

  it("treats a field with no published limit as always within it", () => {
    const spec = LISTING_PROFILES.gumroad.fields.find((field) => field.key === "keywords")!;
    expect(checkListingField(spec, "x".repeat(500)).withinLimit).toBe(true);
  });

  it("lists the required fields a listing is still missing", () => {
    const missing = missingListingFields("kdp_ebook", { title: "A Book" });
    expect(missing.map((field) => field.key)).toContain("description");
    expect(missing.map((field) => field.key)).not.toContain("title");
  });

  it("reports nothing missing when every required field has a value", () => {
    const fields = Object.fromEntries(
      LISTING_PROFILES.kdp_ebook.fields
        .filter((field) => field.required)
        .map((field) => [field.key, "a value"]),
    );
    expect(missingListingFields("kdp_ebook", fields)).toHaveLength(0);
  });

  it("treats whitespace as a missing value", () => {
    const missing = missingListingFields("kdp_ebook", { title: "   " });
    expect(missing.map((field) => field.key)).toContain("title");
  });
});
