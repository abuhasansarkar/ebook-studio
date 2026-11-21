/**
 * The AI cost price list.
 *
 * The point of a price list in the repository is that the cost of a run can be
 * computed rather than guessed. These tests pin that the list is complete
 * enough for the models the product actually uses, that the arithmetic is
 * right, and that an unknown model reports "unknown" instead of zero.
 */
import { describe, it, expect } from "vitest";
import { MODEL_PRICES, PRICE_LIST_RETRIEVED, costOf } from "../src/services/ai/priceList.js";

describe("the OpenAI price list", () => {
  it("is dated, so a reader knows when it was true", () => {
    expect(PRICE_LIST_RETRIEVED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("prices every model the product defaults to", () => {
    // These are the defaults in backend/src/config/env.ts. A model missing
    // from the price list would make every cost report say "unknown".
    for (const model of ["gpt-5-mini", "gpt-5", "gpt-image-2.6-sunburst"]) {
      expect(MODEL_PRICES[model], `${model} is not priced`).toBeDefined();
    }
  });

  it("prices the models the product's other code paths name", () => {
    for (const model of ["gpt-5-nano", "gpt-5.4-mini", "gpt-4o", "gpt-4o-mini", "gpt-image-2", "gpt-image-1-mini"]) {
      expect(MODEL_PRICES[model], `${model} is not priced`).toBeDefined();
    }
  });

  it("gives every price a positive input and output rate", () => {
    for (const [model, price] of Object.entries(MODEL_PRICES)) {
      expect(price.input, `${model} input rate`).toBeGreaterThan(0);
      expect(price.output, `${model} output rate`).toBeGreaterThan(0);
      expect(price.cachedInput, `${model} cached rate`).toBeGreaterThan(0);
    }
  });

  it("charges output more than input for every model", () => {
    // A price list where output is cheaper than input would be a typo, and a
    // typo here quietly understates the cost of a long generation.
    for (const [model, price] of Object.entries(MODEL_PRICES)) {
      expect(price.output, `${model} charges less for output than input`).toBeGreaterThan(price.input);
    }
  });

  it("charges cached input less than fresh input", () => {
    for (const [model, price] of Object.entries(MODEL_PRICES)) {
      expect(price.cachedInput, `${model} cached rate is not below the fresh rate`).toBeLessThan(price.input);
    }
  });
});

describe("the cost of a call", () => {
  it("computes a text call from its token counts", () => {
    // 1M input at $0.25 plus 1M output at $2.00 is $2.25.
    const cost = costOf({ model: "gpt-5-mini", inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).not.toBeNull();
    expect(cost!).toBeCloseTo(2.25, 6);
  });

  it("bills cached tokens at the cached rate", () => {
    const withoutCache = costOf({ model: "gpt-5-mini", inputTokens: 1_000_000, outputTokens: 0 })!;
    const withCache = costOf({ model: "gpt-5-mini", inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 1_000_000 })!;
    expect(withCache).toBeLessThan(withoutCache);
    expect(withCache).toBeCloseTo(0.025, 6);
  });

  it("charges the quality-review model more than the writing model", () => {
    // The review reads the whole chapter and reasons over it, so it is the
    // expensive call in the product, and the price list has to say so.
    const usage = { inputTokens: 10_000, outputTokens: 2_000 };
    const review = costOf({ model: "gpt-5", ...usage })!;
    const writing = costOf({ model: "gpt-5-mini", ...usage })!;
    expect(review).toBeGreaterThan(writing);
  });

  it("reports an unknown model as unknown rather than free", () => {
    // A zero would be read as "this cost nothing", which is a false claim.
    expect(costOf({ model: "not-a-real-model", inputTokens: 1000, outputTokens: 1000 })).toBeNull();
  });

  it("returns zero for a call that used nothing", () => {
    expect(costOf({ model: "gpt-5", inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it("scales linearly with the size of the run", () => {
    const small = costOf({ model: "gpt-5", inputTokens: 1_000, outputTokens: 1_000 })!;
    const large = costOf({ model: "gpt-5", inputTokens: 2_000, outputTokens: 2_000 })!;
    expect(large).toBeCloseTo(small * 2, 10);
  });
});
