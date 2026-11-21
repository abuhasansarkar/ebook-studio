/**
 * OpenAI price list, in US dollars per 1M tokens.
 *
 * Source: https://developers.openai.com/api/docs/pricing (Standard tier),
 * retrieved 21 November 2026. The API itself does not expose prices, so the
 * list is written down here and the cost of a run is computed from it.
 *
 * Image models are priced per 1M tokens too: the image generation call is
 * billed on the image input and the image output, so the token counts of an
 * image call are what the cost is computed from.
 *
 * The date matters. A price list that is not dated is a guess; this one names
 * the day it was read, so a later reader knows when it was true.
 */
export const PRICE_LIST_RETRIEVED = "2026-11-21";

export interface ModelPrice {
  /** US dollars per 1M input tokens. */
  input: number;
  /** US dollars per 1M output tokens. */
  output: number;
  /** US dollars per 1M cached input tokens. */
  cachedInput: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // Standard tier, short context.
  "gpt-5": { input: 1.25, output: 10.0, cachedInput: 0.125 },
  "gpt-5-mini": { input: 0.25, output: 2.0, cachedInput: 0.025 },
  "gpt-5-nano": { input: 0.05, output: 0.4, cachedInput: 0.005 },
  "gpt-5.1": { input: 1.25, output: 10.0, cachedInput: 0.125 },
  "gpt-5.2": { input: 1.75, output: 14.0, cachedInput: 0.175 },
  "gpt-5.4": { input: 2.5, output: 15.0, cachedInput: 0.25 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5, cachedInput: 0.075 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25, cachedInput: 0.02 },
  "gpt-5.5": { input: 5.0, output: 30.0, cachedInput: 0.5 },
  "gpt-5.6-sol": { input: 4.0, output: 20.0, cachedInput: 0.4 },
  "gpt-5.6-terra": { input: 2.0, output: 12.0, cachedInput: 0.4 },
  "gpt-5.6-luna": { input: 0.2, output: 1.2, cachedInput: 0.02 },
  "gpt-6-luna": { input: 0.1, output: 0.5, cachedInput: 0.01 },
  "gpt-6.1-terra": { input: 1.0, output: 5.0, cachedInput: 0.05 },
  "gpt-6.1-sol": { input: 2.0, output: 10.0, cachedInput: 0.1 },
  "gpt-6.2-sol": { input: 2.0, output: 10.0, cachedInput: 0.1 },
  "gpt-6-astra": { input: 10.0, output: 50.0, cachedInput: 1.0 },
  "gpt-6.2-astra": { input: 8.0, output: 40.0, cachedInput: 0.4 },
  "gpt-4o": { input: 2.5, output: 10.0, cachedInput: 1.25 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cachedInput: 0.075 },
  "gpt-4.1": { input: 2.0, output: 8.0, cachedInput: 0.5 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6, cachedInput: 0.1 },
  // Image models. The image call is billed as image input and image output
  // tokens, which is why the image cost is computed from token counts too.
  "gpt-image-2.6-sunburst": { input: 8.0, output: 30.0, cachedInput: 2.0 },
  "gpt-image-2.6-flare": { input: 8.0, output: 30.0, cachedInput: 2.0 },
  "gpt-image-2.5-sunburst": { input: 8.0, output: 30.0, cachedInput: 2.0 },
  "gpt-image-2": { input: 8.0, output: 30.0, cachedInput: 2.0 },
  "gpt-image-1.5": { input: 8.0, output: 32.0, cachedInput: 2.0 },
  "gpt-image-1-mini": { input: 2.5, output: 8.0, cachedInput: 0.25 },
};

export interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

/**
 * The dollar cost of one call. Returns null when the model is not in the
 * price list, because a made-up price is worse than no price: a reader has to
 * be able to tell the difference between "this cost nothing" and "we do not
 * know what this cost".
 *
 * The OpenAI API reports `input_tokens` as the total input, cached tokens
 * included, and `input_tokens_details.cached_tokens` as the subset of it that
 * was served from the cache. So the fresh input is the difference, and the
 * cached part is billed at its own rate. Charging the total at the fresh rate
 * and then adding the cached part on top would bill those tokens twice.
 */
export function costOf(usage: TokenUsage): number | null {
  const price = MODEL_PRICES[usage.model];
  if (!price) return null;
  const cachedTokens = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  const freshTokens = usage.inputTokens - cachedTokens;
  const fresh = freshTokens / 1_000_000;
  const output = usage.outputTokens / 1_000_000;
  const cached = cachedTokens / 1_000_000;
  return fresh * price.input + output * price.output + cached * price.cachedInput;
}
