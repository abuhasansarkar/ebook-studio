import { afterEach, describe, expect, it } from 'vitest';
import { AiIncompleteError, openaiProvider, RETRY_OUTPUT_TOKEN_CAP, setOpenAIClientForTests } from '../src/services/ai/openaiClient.js';

type Reply = { status: string; incomplete_details?: { reason: string } | null; output_text?: string; output_parsed?: unknown; usage?: { input_tokens: number; output_tokens: number } };

/** A fake Responses API that returns the queued replies and records each request's output budget. */
function fakeClient(replies: Reply[]) {
  const budgets: (number | undefined)[] = [];
  const next = async (request: { max_output_tokens?: number }) => {
    budgets.push(request.max_output_tokens);
    const reply = replies.shift();
    if (!reply) throw new Error('unexpected extra provider call');
    return { usage: { input_tokens: 1, output_tokens: 2 }, ...reply };
  };
  setOpenAIClientForTests({ responses: { create: next, parse: next } } as never);
  return budgets;
}

afterEach(() => setOpenAIClientForTests(null));

describe('incomplete provider responses', () => {
  it('returns a completed response unchanged', async () => {
    fakeClient([{ status: 'completed', output_text: 'Whole answer.' }]);
    await expect(openaiProvider.text({ system: 's', user: 'u', model: 'gpt-test', maxOutputTokens: 1000 })).resolves.toMatchObject({ text: 'Whole answer.' });
  });

  it('retries once with a larger budget after a max_output_tokens stop', async () => {
    const budgets = fakeClient([
      { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_text: 'Half an ans' },
      { status: 'completed', output_text: 'The whole answer.' },
    ]);
    const result = await openaiProvider.text({ system: 's', user: 'u', model: 'gpt-test', maxOutputTokens: 4000 });
    expect(result.text).toBe('The whole answer.');
    expect(budgets).toEqual([4000, 8000]);
  });

  it('throws a typed retryable error when the retry is truncated too, never returning partial text', async () => {
    const budgets = fakeClient([
      { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_text: 'Half' },
      { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_text: 'Still half' },
    ]);
    const error = await openaiProvider.text({ system: 's', user: 'u', model: 'gpt-test', maxOutputTokens: 20_000 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiIncompleteError);
    expect(error).toMatchObject({ retryable: true, reason: 'max_output_tokens', status: 'incomplete' });
    expect(budgets).toEqual([20_000, RETRY_OUTPUT_TOKEN_CAP]);
  });

  it('does not retry a content-filter stop', async () => {
    const budgets = fakeClient([{ status: 'incomplete', incomplete_details: { reason: 'content_filter' }, output_text: 'Cut' }]);
    await expect(openaiProvider.text({ system: 's', user: 'u', model: 'gpt-test', maxOutputTokens: 1000 })).rejects.toMatchObject({ name: 'AiIncompleteError', reason: 'content_filter' });
    expect(budgets).toHaveLength(1);
  });

  it('rejects truncated structured output as well', async () => {
    fakeClient([
      { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_parsed: { title: 'partial' } },
      { status: 'failed', incomplete_details: null, output_parsed: { title: 'partial' } },
    ]);
    const { z } = await import('zod');
    await expect(openaiProvider.json({ system: 's', user: 'u', model: 'gpt-test', maxOutputTokens: 1000, schema: z.object({ title: z.string() }), name: 'x' })).rejects.toBeInstanceOf(AiIncompleteError);
  });
});
