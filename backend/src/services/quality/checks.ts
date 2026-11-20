import { createHash } from 'node:crypto';
import { languageScript, makeAnchor, textBlocks, type BookContext, type DetectionMethod, type QualityCategory, type QualitySeverity, type TextAnchor, type TextBlock } from '@ebook/shared';

/**
 * Deterministic checks (rules version 1). Pure: same input, same findings. Analysis never edits the
 * manuscript; every text finding carries a quote anchor that the editor can locate and highlight.
 */
export interface ChapterInput { id: string; version: number; position: number; title: string; content: unknown; wordCount: number; targetWords: number }
export interface CheckInput {
  title: string; subtitle: string; author: string; language: string;
  chapters: ChapterInput[];
  /** Image asset ids that are owned by the book owner and ready. */
  readyAssets: ReadonlySet<string>;
  context: BookContext;
  referencesEnabled: boolean;
  /** Characters that no approved font for this book can draw (from the S08 font registry). */
  uncoveredCharacters: ReadonlySet<string>;
}
export interface FindingDraft {
  key: string; ruleId: string; category: QualityCategory; severity: QualitySeverity; method: DetectionMethod;
  chapterId: string | null; anchor: TextAnchor | null; message: string; evidence: string;
  /** replacement: exact text for an explicit editor fix; advice: guidance only. */
  suggestion: { replacement?: string; advice?: string } | null; needsHumanReview: boolean;
}

export type CheckDescriptor = { id: string; label: string; method: DetectionMethod; scope: string };
export const RULE_CHECKS: CheckDescriptor[] = [
  { id: 'metadata', label: 'Title and author are set', method: 'rule', scope: 'All languages' },
  { id: 'content', label: 'Empty, very short and duplicate-titled chapters', method: 'rule', scope: 'All languages' },
  { id: 'placeholder', label: 'Leftover placeholders, AI disclaimers and raw Markdown', method: 'rule', scope: 'Placeholder words are English; Markdown markers in all languages' },
  { id: 'structure', label: 'Heading hierarchy, empty and back-to-back headings', method: 'rule', scope: 'All languages' },
  { id: 'repetition', label: 'Repeated paragraphs and sentences across the book', method: 'rule', scope: 'Exact repeats after normalising case and punctuation' },
  { id: 'assets', label: 'Unavailable images and missing alt text', method: 'rule', scope: 'All languages' },
  { id: 'links', label: 'Internal links without targets and insecure links', method: 'rule', scope: 'Links are not fetched; reachability is not checked' },
  { id: 'terminology', label: 'Variants your book context says to avoid', method: 'rule', scope: 'Whole-word matches of your term list' },
  { id: 'language', label: 'Chapters mostly written in another script', method: 'heuristic', scope: 'Script-based; cannot tell languages sharing a script apart' },
  { id: 'typesetting', label: 'Characters no approved font can draw', method: 'rule', scope: 'Bundled S08 fonts' },
  { id: 'evidence', label: 'Statistical and research claims that need a source', method: 'heuristic', scope: 'Percentages in all languages; claim phrases in English only' },
];
export const NOT_CHECKED = [
  'Factual accuracy is not verified. Flagged claims need human review.',
  'Originality and plagiarism are not checked.',
  'External links are not fetched, so broken URLs are not detected.',
  'Grammar, spelling and style are only reviewed by the optional AI review.',
];

const MAX_FINDINGS = 1000;
const norm = (s: string) => s.normalize('NFC').toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
const keyOf = (...parts: (string | number | null)[]) => createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32);
const SCRIPT_PATTERN: Record<string, RegExp> = {
  latin: /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]/gu, bengali: /\p{Script=Bengali}/gu, arabic: /\p{Script=Arabic}/gu, urdu: /\p{Script=Arabic}/gu,
  devanagari: /\p{Script=Devanagari}/gu, tamil: /\p{Script=Tamil}/gu, sc: /\p{Script=Han}/gu, jp: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, kr: /\p{Script=Hangul}/gu,
};
const PLACEHOLDERS: [RegExp, string][] = [
  [/\b(?:TODO|TBD|FIXME|XXX)\b/g, 'Placeholder marker left in the text.'],
  [/lorem ipsum/gi, 'Placeholder "lorem ipsum" text left in the chapter.'],
  [/\[(?:insert|add|your|citation needed|source|link|image|name)[^\]\n]{0,60}\]/gi, 'Bracketed placeholder left in the text.'],
  [/\{\{[^}\n]{0,60}\}\}/g, 'Template placeholder left in the text.'],
  [/\bas an AI(?: language)? model\b/gi, 'AI assistant disclaimer left in the text.'],
];
const MARKDOWN = /^(?:#{1,6}\s|[-*+]\s\S|>\s)|\*\*[^*\n]{1,80}\*\*|__[^_\n]{1,80}__/g;
const CLAIM = /\d+(?:[.,]\d+)?\s?%|\b\d+(?:[.,]\d+)?\s?(?:percent|per cent)\b|\b(?:studies|research|surveys?|statistics|data|scientists|experts|doctors)\s+(?:show|shows|suggest|suggests|found|find|prove|proves|say|says|agree|indicate|indicates|confirm|confirms|has shown|have shown)\b|\baccording to\b|\b(?:clinically|scientifically)\s+proven\b|\bproven to\b/gi;
const SENTENCE = /[^.!?।。！？\n]+[.!?।。！？]?/gu;

export function runRuleChecks(input: CheckInput): { findings: FindingDraft[]; truncated: boolean } {
  const out: FindingDraft[] = [];
  const add = (f: Omit<FindingDraft, 'key' | 'suggestion' | 'needsHumanReview' | 'method' | 'evidence'> & Partial<Pick<FindingDraft, 'suggestion' | 'needsHumanReview' | 'method' | 'evidence'>>) => {
    out.push({ method: 'rule', evidence: '', suggestion: null, needsHumanReview: false, ...f, key: keyOf(f.ruleId, f.chapterId, f.anchor?.quote ?? f.message) });
  };
  const at = (c: ChapterInput, b: TextBlock, start: number, end: number) => makeAnchor(c.id, c.version, b, start, end);

  if (!input.title.trim() || input.title.trim() === 'Untitled book') add({ ruleId: 'metadata.title-missing', category: 'metadata', severity: 'error', chapterId: null, anchor: null, message: 'The book has no final title.', evidence: 'Set the title in the book brief.' });
  if (!input.author.trim()) add({ ruleId: 'metadata.author-missing', category: 'metadata', severity: 'warning', chapterId: null, anchor: null, message: 'No author or pen name is set. The title page, copyright notice and store listings need one.', evidence: 'Set the author name in the book brief.' });

  const script = languageScript(input.language);
  const titles = new Map<string, ChapterInput>();
  const paragraphs = new Map<string, { chapter: ChapterInput; block: TextBlock }>();
  const sentences = new Map<string, { chapter: ChapterInput; block: TextBlock }>();
  // Word boundaries include combining marks: Bengali/Devanagari vowel signs and viramas are \p{M}, not letters.
  const terms = input.context.terms.flatMap(t => t.avoid.map(avoid => ({ avoid, preferred: t.preferred, pattern: new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${avoid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{M}\\p{N}])`, 'giu') })));

  for (const chapter of input.chapters) {
    const blocks = textBlocks(chapter.content);
    const label = `Chapter ${chapter.position + 1}`;
    const hasImages = JSON.stringify(chapter.content ?? '').includes('"type":"image"');
    if (!blocks.some(b => b.text.trim()) && !hasImages) add({ ruleId: 'content.empty-chapter', category: 'content', severity: 'error', chapterId: chapter.id, anchor: null, message: `${label} has no content.`, evidence: chapter.title });
    else if (chapter.wordCount > 0 && chapter.targetWords > 0 && chapter.wordCount < chapter.targetWords * 0.25) add({ ruleId: 'content.short-chapter', category: 'content', severity: 'warning', chapterId: chapter.id, anchor: null, message: `${label} is much shorter than planned.`, evidence: `${chapter.wordCount} of about ${chapter.targetWords} planned words.` });
    const normalizedTitle = norm(chapter.title);
    if (normalizedTitle && titles.has(normalizedTitle)) add({ ruleId: 'content.duplicate-title', category: 'content', severity: 'warning', chapterId: chapter.id, anchor: null, message: `${label} has the same title as chapter ${titles.get(normalizedTitle)!.position + 1}.`, evidence: chapter.title });
    else if (normalizedTitle) titles.set(normalizedTitle, chapter);

    let lastHeading = 1;
    const glyphs = new Map<string, { block: TextBlock; start: number }>();
    let letters = 0, native = 0;
    blocks.forEach((block, i) => {
      const text = block.text;
      // Placeholders and leftover Markdown.
      for (const [pattern, message] of PLACEHOLDERS) for (const m of text.matchAll(pattern)) add({ ruleId: 'content.placeholder', category: 'content', severity: 'error', chapterId: chapter.id, anchor: at(chapter, block, m.index!, m.index! + m[0].length), message, evidence: m[0] });
      if (block.type !== 'codeBlock') for (const m of text.matchAll(MARKDOWN)) add({ ruleId: 'content.markdown', category: 'content', severity: 'warning', chapterId: chapter.id, anchor: at(chapter, block, m.index!, m.index! + m[0].length), message: 'Raw Markdown formatting appears as literal characters.', evidence: m[0] });
      // Heading hierarchy (the chapter title is level 1).
      if (block.type === 'heading') {
        const level = block.level ?? 2;
        if (!text.trim()) add({ ruleId: 'structure.empty-heading', category: 'structure', severity: 'warning', chapterId: chapter.id, anchor: null, message: `${label} contains an empty heading.`, evidence: blocks[i - 1]?.text.slice(-80) ? `After: “${blocks[i - 1].text.slice(-80)}”` : 'At the start of the chapter.' });
        else {
          if (level > lastHeading + 1) add({ ruleId: 'structure.heading-skip', category: 'structure', severity: 'warning', chapterId: chapter.id, anchor: at(chapter, block, 0, text.length), message: `Heading level ${level} follows level ${lastHeading}, skipping a level. Screen readers and tables of contents rely on the hierarchy.`, evidence: text });
          const next = blocks.slice(i + 1).find(b => b.text.trim() || b.type === 'heading');
          if (!next || (next.type === 'heading' && (next.level ?? 2) <= level && !hasContentBetween(chapter.content, block.index, next.index))) add({ ruleId: 'structure.heading-without-content', category: 'structure', severity: 'info', chapterId: chapter.id, anchor: at(chapter, block, 0, text.length), message: next ? 'This heading has no content before the next heading.' : 'This heading ends the chapter without any content.', evidence: text });
        }
        lastHeading = level;
      }
      // Repetition.
      const normalized = norm(text);
      if (block.type === 'paragraph' && normalized.length >= 80) {
        const first = paragraphs.get(normalized);
        if (first) add({ ruleId: 'repetition.paragraph', category: 'repetition', severity: 'warning', chapterId: chapter.id, anchor: at(chapter, block, 0, text.length), message: 'This paragraph repeats an earlier paragraph word for word.', evidence: `Also in chapter ${first.chapter.position + 1}: “${first.block.text.slice(0, 120)}”` });
        else {
          paragraphs.set(normalized, { chapter, block });
          for (const m of text.matchAll(SENTENCE)) {
            const sentence = norm(m[0]);
            if (sentence.length < 60) continue;
            const prior = sentences.get(sentence);
            if (prior && prior.block !== block) add({ ruleId: 'repetition.sentence', category: 'repetition', severity: 'info', chapterId: chapter.id, anchor: at(chapter, block, m.index! + (m[0].length - m[0].trimStart().length), m.index! + m[0].trimEnd().length), message: 'This sentence repeats an earlier sentence.', evidence: `First used in chapter ${prior.chapter.position + 1}.` });
            else if (!prior) sentences.set(sentence, { chapter, block });
          }
        }
      }
      // Links (never fetched).
      for (const link of block.links) {
        const anchor = at(chapter, block, link.start, link.end);
        if (link.href.startsWith('#')) add({ ruleId: 'links.internal', category: 'links', severity: 'warning', chapterId: chapter.id, anchor, message: 'This internal link has no target in exported files.', evidence: link.href });
        else if (/^http:\/\//i.test(link.href)) add({ ruleId: 'links.insecure', category: 'links', severity: 'info', chapterId: chapter.id, anchor, message: 'This link uses http:// instead of https://. Some readers block or warn about insecure links.', evidence: link.href });
      }
      // Terminology from the book context.
      if (block.type !== 'codeBlock') for (const t of terms) for (const m of text.matchAll(t.pattern)) add({ ruleId: 'consistency.term', category: 'consistency', severity: 'warning', chapterId: chapter.id, anchor: at(chapter, block, m.index!, m.index! + m[0].length), message: `Use “${t.preferred}” instead of “${m[0]}”, as set in your book context.`, evidence: m[0], suggestion: { replacement: t.preferred } });
      // Evidence-needing claims (heuristic, human review).
      if (block.type === 'paragraph') for (const m of text.matchAll(SENTENCE)) {
        if (!new RegExp(CLAIM.source, 'i').test(m[0])) continue;
        const start = m.index! + (m[0].length - m[0].trimStart().length);
        add({ ruleId: 'evidence.claim', category: 'evidence', severity: 'info', method: 'heuristic', needsHumanReview: true, chapterId: chapter.id, anchor: at(chapter, block, start, m.index! + m[0].trimEnd().length), message: `This sentence makes a factual or statistical claim. Verify it and cite a source${input.referencesEnabled ? ' in References' : '; the book has no References section'}. The claim's accuracy is not assessed here.`, evidence: m[0].trim() });
      }
      // Glyph coverage: collected per chapter and reported once (see below).
      for (const ch of text) if (input.uncoveredCharacters.has(ch) && !glyphs.has(ch)) glyphs.set(ch, { block, start: text.indexOf(ch) });
      if (block.type !== 'codeBlock') { letters += (text.match(/\p{L}/gu) ?? []).length; native += (text.match(SCRIPT_PATTERN[script]) ?? []).length; }
    });
    if (glyphs.size) {
      const [firstChar, first] = [...glyphs.entries()][0];
      const listed = [...glyphs.keys()].slice(0, 20).map(ch => `${ch} (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`).join(', ');
      add({ ruleId: 'typesetting.glyph', category: 'typesetting', severity: 'warning', chapterId: chapter.id, anchor: at(chapter, first.block, first.start, first.start + firstChar.length), message: `${glyphs.size} character${glyphs.size === 1 ? '' : 's'} in ${label} cannot be drawn by an approved font. Exports will use a system font or show boxes.`, evidence: listed + (glyphs.size > 20 ? ' …' : '') });
    }
    if (letters >= 200 && native / letters < 0.5) add({ ruleId: 'language.script', category: 'language', severity: 'warning', method: 'heuristic', chapterId: chapter.id, anchor: null, message: `Most of ${label} is not written in the book's language script.`, evidence: `${Math.round((native / letters) * 100)}% of letters match the expected script.` });

    // Images: availability and alt text (images are not text blocks, so they are identified by position).
    let image = 0;
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const n = node as { type?: string; attrs?: { assetId?: string; alt?: string; caption?: string }; content?: unknown[] };
      if (n.type === 'image') {
        image++;
        const name = n.attrs?.caption ? `Image ${image} (“${n.attrs.caption.slice(0, 60)}”)` : `Image ${image}`;
        if (!n.attrs?.assetId || !input.readyAssets.has(n.attrs.assetId)) add({ ruleId: 'assets.unavailable', category: 'assets', severity: 'error', chapterId: chapter.id, anchor: null, message: `${name} in ${label} is not available. Exports will fail until it is replaced or removed.`, evidence: name });
        else if (!n.attrs.alt?.trim()) add({ ruleId: 'accessibility.alt', category: 'accessibility', severity: 'warning', chapterId: chapter.id, anchor: null, message: `${name} in ${label} has no alt text for screen-reader users.`, evidence: name });
      }
      for (const child of n.content ?? []) walk(child);
    };
    walk(chapter.content);
  }
  return { findings: out.slice(0, MAX_FINDINGS), truncated: out.length > MAX_FINDINGS };
}

/** True when an image or other non-text node sits between two text blocks. */
function hasContentBetween(doc: unknown, from: number, to: number) {
  let index = -1, found = false;
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object' || found) return;
    const n = node as { type?: string; content?: unknown[] };
    if (n.type === 'paragraph' || n.type === 'heading' || n.type === 'codeBlock') { index++; return; }
    if ((n.type === 'image' || n.type === 'horizontalRule' || n.type === 'table') && index >= from && index < to) { found = true; return; }
    for (const child of n.content ?? []) walk(child);
  };
  walk(doc);
  return found;
}
