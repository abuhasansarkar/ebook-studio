import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";
import { env } from "../../config/env.js";
import { serviceUnavailable } from "../../utils/errors.js";

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  /** Tokens served from the prompt cache. They are billed at a lower rate, so
   *  a cost computed without them would overstate the cost of a run. */
  cachedInputTokens?: number;
}

export interface AiTextResult {
  text: string;
  usage: AiUsage;
}

export interface AiJsonResult<T> {
  data: T;
  usage: AiUsage;
}

interface CallOptions {
  system: string;
  user: string;
  model?: string;
  maxOutputTokens?: number;
}

/**
 * The provider stopped before finishing its answer: it ran out of output
 * budget (`max_output_tokens`), filtered the content (`content_filter`) or
 * returned some other non-`completed` status. A truncated answer is never
 * returned as if it were whole, so nothing downstream checkpoints half a section.
 */
export class AiIncompleteError extends Error {
  readonly retryable = true;
  constructor(readonly model: string, readonly status: string, readonly reason: string | null) {
    super(`Response from ${model} was incomplete (status: ${status}${reason ? `, reason: ${reason}` : ''})`);
    this.name = 'AiIncompleteError';
  }
}

/** The output budget of the one retry after a `max_output_tokens` stop. */
export const RETRY_OUTPUT_TOKEN_CAP = 32_000;

interface ResponseLike { status?: string | null; incomplete_details?: { reason?: string | null } | null }

/** Throws unless the response is complete. */
function assertComplete(model: string, response: ResponseLike) {
  const status = response.status ?? 'completed';
  const reason = response.incomplete_details?.reason ?? null;
  if (status !== 'completed' || reason) throw new AiIncompleteError(model, status, reason);
}

/**
 * Runs a provider call; when it stopped at its output budget, retries once with
 * twice the budget (bounded). A content-filter stop, or a second truncation,
 * is raised as `AiIncompleteError`.
 */
async function complete<R extends ResponseLike>(model: string, maxOutputTokens: number | undefined, call: (budget: number | undefined) => Promise<R>): Promise<R> {
  const first = await call(maxOutputTokens);
  try {
    assertComplete(model, first);
    return first;
  } catch (err) {
    if (!(err instanceof AiIncompleteError) || err.reason !== 'max_output_tokens' || !maxOutputTokens || maxOutputTokens >= RETRY_OUTPUT_TOKEN_CAP) throw err;
  }
  const second = await call(Math.min(RETRY_OUTPUT_TOKEN_CAP, maxOutputTokens * 2));
  assertComplete(model, second);
  return second;
}

let client: OpenAI | null = null;

/** Test seam: replaces the SDK client (pass null to restore the configured one). */
export function setOpenAIClientForTests(replacement: Pick<OpenAI, 'responses'> | null) {
  client = replacement as OpenAI | null;
}

function getClient(): OpenAI {
  if (client) return client;
  if (!env.OPENAI_API_KEY) {
    throw serviceUnavailable("AI is not configured. Set OPENAI_API_KEY (or AI_MOCK=1 for development).");
  }
  client ??= new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    maxRetries: env.OPENAI_MAX_RETRIES,
    timeout: env.OPENAI_TIMEOUT_MS,
  });
  return client;
}

/** Reasoning models spend output tokens on thinking; keep effort low for drafting tasks. */
function reasoningFor(model: string) {
  const effort = env.OPENAI_REASONING_EFFORT;
  if (!effort) return undefined;
  return /^(gpt-5|o\d)/.test(model) ? { effort } : undefined;
}

function usageOf(model: string, usage: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } | null | undefined): AiUsage {
  const cached = usage?.input_tokens_details?.cached_tokens ?? 0;
  return {
    model,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    ...(cached > 0 ? { cachedInputTokens: cached } : {}),
  };
}

/** The single OpenAI provider layer. All text generation goes through here. */
export const openaiProvider = {
  async text(opts: CallOptions): Promise<AiTextResult> {
    const model = opts.model ?? env.OPENAI_TEXT_MODEL;
    const response = await complete(model, opts.maxOutputTokens, (budget) => getClient().responses.create({
      model,
      instructions: opts.system,
      input: opts.user,
      max_output_tokens: budget,
      reasoning: reasoningFor(model),
    }));
    const text = response.output_text?.trim() ?? "";
    if (!text) throw new Error(`Empty response from ${model} (status: ${response.status})`);
    return { text, usage: usageOf(model, response.usage) };
  },

  async json<T>(opts: CallOptions & { schema: ZodType<T>; name: string }): Promise<AiJsonResult<T>> {
    const model = opts.model ?? env.OPENAI_TEXT_MODEL;
    const response = await complete(model, opts.maxOutputTokens, (budget) => getClient().responses.parse({
      model,
      instructions: opts.system,
      input: opts.user,
      max_output_tokens: budget,
      reasoning: reasoningFor(model),
      text: { format: zodTextFormat(opts.schema, opts.name) },
    }));
    if (!response.output_parsed) throw new Error(`Model ${model} returned no structured output`);
    return { data: response.output_parsed as T, usage: usageOf(model, response.usage) };
  },
};
