import { z } from 'zod';

/**
 * S09 quality review contract. Findings point at text through quote anchors (W3C text-quote style):
 * the chapter version, a text-block index and offset, the exact quote and short prefix/suffix context.
 * TipTap documents have no stable node ids, so anchors are re-located by quote after edits and are
 * reported as missing rather than highlighting unrelated text.
 */
export const QUALITY_RULES_VERSION = 1;
export const QUALITY_CATEGORIES = ['metadata', 'content', 'structure', 'repetition', 'assets', 'accessibility', 'links', 'consistency', 'contradiction', 'language', 'typesetting', 'evidence', 'clarity'] as const;
export type QualityCategory = typeof QUALITY_CATEGORIES[number];
export const QUALITY_SEVERITIES = ['error', 'warning', 'info'] as const;
export type QualitySeverity = typeof QUALITY_SEVERITIES[number];
/** rule: deterministic; heuristic: deterministic pattern with expected false positives; ai: model suggestion with a verified quote. */
export const DETECTION_METHODS = ['rule', 'heuristic', 'ai'] as const;
export type DetectionMethod = typeof DETECTION_METHODS[number];
export const REVIEW_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type ReviewStatus = typeof REVIEW_STATUSES[number];

export const CATEGORY_LABELS: Record<QualityCategory, string> = {
  metadata: 'Book details', content: 'Content', structure: 'Headings', repetition: 'Repetition', assets: 'Images', accessibility: 'Accessibility',
  links: 'Links', consistency: 'Terminology', contradiction: 'Contradictions', language: 'Language', typesetting: 'Typesetting', evidence: 'Needs evidence', clarity: 'Clarity',
};

export const textAnchorSchema = z.object({
  chapterId: z.string().min(1).max(100),
  chapterVersion: z.number().int().min(0),
  block: z.number().int().min(0),
  start: z.number().int().min(0),
  quote: z.string().min(1).max(500),
  prefix: z.string().max(40),
  suffix: z.string().max(40),
}).strict();
export type TextAnchor = z.infer<typeof textAnchorSchema>;

export interface TextBlock { index: number; type: 'paragraph' | 'heading' | 'codeBlock'; level?: number; context: 'body' | 'list' | 'table' | 'quote'; text: string; links: { start: number; end: number; href: string }[] }

/**
 * Text blocks in document order: every paragraph, heading and code block, including those inside lists,
 * quotes and tables. Block text is the concatenation of text nodes, which matches ProseMirror's
 * `textContent`, so editor positions can be derived from (block, offset).
 */
export function textBlocks(doc: unknown): TextBlock[] {
  const blocks: TextBlock[] = [];
  const visit = (node: unknown, context: TextBlock['context'], depth: number) => {
    if (!node || typeof node !== 'object' || depth > 40) return;
    const n = node as { type?: string; attrs?: { level?: number }; content?: unknown[] };
    if (n.type === 'paragraph' || n.type === 'heading' || n.type === 'codeBlock') {
      let text = '';
      const links: TextBlock['links'] = [];
      for (const child of n.content ?? []) {
        const c = child as { type?: string; text?: string; marks?: { type: string; attrs?: { href?: string } }[] };
        if (c.type !== 'text' || typeof c.text !== 'string') continue;
        const link = c.marks?.find(m => m.type === 'link');
        if (link && typeof link.attrs?.href === 'string') {
          const last = links[links.length - 1];
          if (last && last.end === text.length && last.href === link.attrs.href) last.end += c.text.length;
          else links.push({ start: text.length, end: text.length + c.text.length, href: link.attrs.href });
        }
        text += c.text;
      }
      blocks.push({ index: blocks.length, type: n.type, ...(n.type === 'heading' ? { level: Number(n.attrs?.level) || 2 } : {}), context, text, links });
      return;
    }
    const next = n.type === 'bulletList' || n.type === 'orderedList' ? 'list' : n.type === 'table' ? 'table' : n.type === 'blockquote' ? 'quote' : context;
    for (const child of n.content ?? []) visit(child, next, depth + 1);
  };
  visit(doc, 'body', 0);
  return blocks;
}

const CONTEXT = 32;
export function makeAnchor(chapterId: string, chapterVersion: number, block: TextBlock, start: number, end: number): TextAnchor {
  const quote = block.text.slice(start, Math.min(end, start + 500));
  return { chapterId, chapterVersion, block: block.index, start, quote, prefix: block.text.slice(Math.max(0, start - CONTEXT), start), suffix: block.text.slice(start + quote.length, start + quote.length + CONTEXT) };
}

export type AnchorStatus = 'current' | 'moved' | 'missing';
export type AnchorLocation = { status: 'current' | 'moved'; block: number; start: number; end: number } | { status: 'missing' };
function sharedSuffix(a: string, b: string) { let n = 0; while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++; return n; }
function sharedPrefix(a: string, b: string) { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n; }
/** Finds the anchored quote in the current text. Ambiguous matches are ranked by surrounding context, then proximity. */
export function locateAnchor(blocks: TextBlock[], anchor: TextAnchor): AnchorLocation {
  const exact = blocks[anchor.block];
  if (exact && exact.text.startsWith(anchor.quote, anchor.start) && exact.text.slice(Math.max(0, anchor.start - anchor.prefix.length), anchor.start) === anchor.prefix) {
    return { status: 'current', block: anchor.block, start: anchor.start, end: anchor.start + anchor.quote.length };
  }
  let best: { block: number; start: number; score: number } | null = null;
  for (const b of blocks) {
    for (let at = b.text.indexOf(anchor.quote); at >= 0; at = b.text.indexOf(anchor.quote, at + 1)) {
      const score = sharedSuffix(b.text.slice(0, at), anchor.prefix) + sharedPrefix(b.text.slice(at + anchor.quote.length), anchor.suffix) - Math.abs(b.index - anchor.block) * 0.01;
      if (!best || score > best.score) best = { block: b.index, start: at, score };
    }
  }
  if (!best) return { status: 'missing' };
  return { status: best.block === anchor.block && best.start === anchor.start ? 'current' : 'moved', block: best.block, start: best.start, end: best.start + anchor.quote.length };
}

const term = z.string().trim().min(1, 'Enter a term').max(80);
/** A definition the author fixes for the book. Used to check that the manuscript keeps the same meaning. */
const definition = z.object({
  term: term,
  definition: z.string().trim().min(1, 'Enter a definition').max(500),
  note: z.string().trim().max(300),
}).strict();
/** Versioned book context used by terminology checks and AI review. */
export const bookContextSchema = z.object({
  voice: z.string().trim().max(2000),
  terms: z.array(z.object({ preferred: term, avoid: z.array(term).max(10), note: z.string().trim().max(300) }).strict()).max(100),
  definitions: z.array(definition).max(100).default([]),
  /** One-line summaries of chapters the author has written, used for cross-chapter continuity checks. */
  chapterSummaries: z.array(z.object({ chapterId: z.string().trim().min(1).max(100), summary: z.string().trim().min(1, 'Enter a summary').max(600) }).strict()).max(200).default([]),
}).strict().superRefine((c, ctx) => {
  const seen = new Map<string, number>();
  c.terms.forEach((t, i) => {
    for (const word of [t.preferred, ...t.avoid]) {
      const key = word.toLocaleLowerCase();
      if (seen.has(key) && seen.get(key) !== i) ctx.addIssue({ code: 'custom', path: ['terms', i], message: `"${word}" appears in more than one term entry` });
      seen.set(key, i);
    }
    if (t.avoid.some(a => a.toLocaleLowerCase() === t.preferred.toLocaleLowerCase())) ctx.addIssue({ code: 'custom', path: ['terms', i, 'avoid'], message: 'A variant to avoid cannot equal the preferred term' });
  });
  const defined = new Set<string>();
  c.definitions.forEach((d, i) => {
    const key = d.term.toLocaleLowerCase();
    if (defined.has(key)) ctx.addIssue({ code: 'custom', path: ['definitions', i], message: `"${d.term}" has more than one definition` });
    defined.add(key);
  });
  const chapters = new Set<string>();
  c.chapterSummaries.forEach((s, i) => {
    if (chapters.has(s.chapterId)) ctx.addIssue({ code: 'custom', path: ['chapterSummaries', i], message: 'This chapter already has a summary' });
    chapters.add(s.chapterId);
  });
});
export type BookContext = z.infer<typeof bookContextSchema>;

export const findingReviewSchema = z.object({
  status: z.enum(REVIEW_STATUSES),
  note: z.string().trim().max(1000).default(''),
}).strict().refine(v => v.status !== 'dismissed' || v.note.length >= 3, { message: 'Explain why this finding is dismissed', path: ['note'] });
export const aiReviewRequestSchema = z.object({
  chapterIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)).min(1).max(100),
  expectedCredits: z.number().int().positive(),
}).strict();
