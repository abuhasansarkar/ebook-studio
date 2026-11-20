import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";
import { env } from "../../config/env.js";
import { serviceUnavailable } from "../../utils/errors.js";

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
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

let client: OpenAI | null = null;

function getClient(): OpenAI {
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

function usageOf(model: string, usage: { input_tokens?: number; output_tokens?: number } | null | undefined): AiUsage {
  return { model, inputTokens: usage?.input_tokens ?? 0, outputTokens: usage?.output_tokens ?? 0 };
}

/** The single OpenAI provider layer. All text generation goes through here. */
export const openaiProvider = {
  async text(opts: CallOptions): Promise<AiTextResult> {
    const model = opts.model ?? env.OPENAI_TEXT_MODEL;
    const response = await getClient().responses.create({
      model,
      instructions: opts.system,
      input: opts.user,
      max_output_tokens: opts.maxOutputTokens,
      reasoning: reasoningFor(model),
    });
    const text = response.output_text?.trim() ?? "";
    if (!text) throw new Error(`Empty response from ${model} (status: ${response.status})`);
    return { text, usage: usageOf(model, response.usage) };
  },

  async json<T>(opts: CallOptions & { schema: ZodType<T>; name: string }): Promise<AiJsonResult<T>> {
    const model = opts.model ?? env.OPENAI_TEXT_MODEL;
    const response = await getClient().responses.parse({
      model,
      instructions: opts.system,
      input: opts.user,
      max_output_tokens: opts.maxOutputTokens,
      reasoning: reasoningFor(model),
      text: { format: zodTextFormat(opts.schema, opts.name) },
    });
    if (!response.output_parsed) throw new Error(`Model ${model} returned no structured output`);
    return { data: response.output_parsed as T, usage: usageOf(model, response.usage) };
  },
};
