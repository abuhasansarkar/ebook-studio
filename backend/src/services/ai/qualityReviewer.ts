import { z } from 'zod';
import { getLanguage, type BookContext, type TextBlock } from '@ebook/shared';
import { env } from '../../config/env.js';
import { openaiProvider, type AiUsage } from './openaiClient.js';

/** Strict structured output; every field required. Quotes are verified against the chapter before use. */
export const aiFindingSchema = z.object({
  findings: z.array(z.object({
    paragraph: z.number().int(),
    quote: z.string(),
    category: z.enum(['clarity', 'repetition', 'consistency', 'contradiction', 'evidence']),
    severity: z.enum(['warning', 'info']),
    message: z.string(),
    suggestion: z.string(),
  })),
});
export type AiFinding = z.infer<typeof aiFindingSchema>['findings'][number];
export interface ReviewInput { language: string; bookTitle: string; chapterTitle: string; blocks: TextBlock[]; context: BookContext }

const MAX_CHARS = 60_000;
export function reviewPrompt(i: ReviewInput) {
  const glossary = i.context.terms.map(t => `- Use "${t.preferred}"${t.avoid.length ? `, not ${t.avoid.map(a => `"${a}"`).join(', ')}` : ''}${t.note ? ` (${t.note})` : ''}`).join('\n') || '(none)';
  const definitions = i.context.definitions.map(d => `- "${d.term}": ${d.definition}${d.note ? ` (${d.note})` : ''}`).join('\n') || '(none)';
  const summaries = i.context.chapterSummaries.map(s => `- ${s.summary}`).join('\n') || '(none)';
  let used = 0;
  const numbered = i.blocks.filter(b => b.text.trim()).map(b => `[${b.index}] ${b.text}`).filter(line => (used += line.length) <= MAX_CHARS).join('\n');
  return {
    system: `You are a careful book editor reviewing one chapter written in ${getLanguage(i.language).name}.
Report only concrete problems in these categories:
- clarity: sentences that are confusing, ambiguous or hard to follow;
- repetition: ideas or phrasing repeated within the chapter;
- consistency: terminology that conflicts with the glossary, or statements that contradict each other;
- contradiction: a statement that contradicts the author's stated definitions or contradicts an earlier chapter summary. Only report it when the contradiction is explicit in the text;
- evidence: factual, statistical, medical, legal or historical claims that need a source. Do NOT judge whether they are true; say they need verification.
Rules:
- "paragraph" is the number in square brackets. "quote" must be copied exactly, character for character, from that paragraph (at most 200 characters, no ellipses).
- Write "message" and "suggestion" in English. Keep quotes in the original language. Use an empty suggestion when you have none.
- Report at most 12 findings and none at all if the chapter is fine. Do not report spelling of names, style preferences or formatting.`,
    user: `Book: ${i.bookTitle}\nChapter: ${i.chapterTitle}\nAuthor's voice: ${i.context.voice || '(not specified)'}\nGlossary:\n${glossary}\nAgreed definitions:\n${definitions}\nChapter summaries so far:\n${summaries}\n\nNumbered paragraphs:\n${numbered}`,
    truncated: used > MAX_CHARS,
  };
}

const mockUsage: AiUsage = { model: 'mock', inputTokens: 0, outputTokens: 0 };
/** Deterministic mock: one quoted clarity note, an evidence note when numbers appear, and one invalid reference. */
function mockReview(i: ReviewInput): AiFinding[] {
  const findings: AiFinding[] = [];
  const first = i.blocks.find(b => b.type === 'paragraph' && b.text.split(/\s+/).length >= 8);
  if (first) findings.push({ paragraph: first.index, quote: first.text.split(/(?<=[.!?।。])\s/)[0].slice(0, 200), category: 'clarity', severity: 'info', message: 'Mock review: consider whether this opening sentence states the main point directly.', suggestion: '' });
  const numeric = i.blocks.find(b => /\d/.test(b.text));
  if (numeric) { const m = numeric.text.match(/[^.!?]*\d[^.!?]*[.!?]?/)!; findings.push({ paragraph: numeric.index, quote: m[0].trim().slice(0, 200), category: 'evidence', severity: 'info', message: 'Mock review: this number needs a source.', suggestion: '' }); }
  findings.push({ paragraph: 0, quote: 'This sentence does not appear in the chapter.', category: 'clarity', severity: 'warning', message: 'Mock review: invalid reference that must be discarded.', suggestion: '' });
  return findings;
}

export const qualityReviewer = {
  async review(i: ReviewInput): Promise<{ findings: AiFinding[]; usage: AiUsage; truncated: boolean }> {
    const prompt = reviewPrompt(i);
    if (env.AI_MOCK) return { findings: mockReview(i), usage: mockUsage, truncated: prompt.truncated };
    const { data, usage } = await openaiProvider.json({ system: prompt.system, user: prompt.user, schema: aiFindingSchema, name: 'chapter_review', model: env.OPENAI_QUALITY_MODEL, maxOutputTokens: 8000 });
    return { findings: data.findings.slice(0, 20), usage, truncated: prompt.truncated };
  },
};
