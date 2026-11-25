import { createHash } from 'node:crypto';
import { languageScript, makeAnchor, textBlocks, type BookContext, type CitationState, type DetectionMethod, type QualityCategory, type QualitySeverity, type TextAnchor, type TextBlock } from '@ebook/shared';

/**
 * Deterministic checks (rules version 1). Pure: same input, same findings. Analysis never edits the
 * manuscript; every text finding carries a quote anchor that the editor can locate and highlight.
 */
export interface ChapterInput { id: string; version: number; position: number; title: string; content: unknown; wordCount: number; targetWords: number }
/**
 * One citation of a chapter, and the state of the text it rests on.
 *
 * The state is decided by the shared assessment, so the quality report and the
 * research workspace cannot disagree about whether a citation still holds.
 */
export interface CitationInput {
  chapterId: string;
  /** The position of the cited chapter in the book, for the message. */
  chapterPosition: number;
  sourceTitle: string;
  locators: string[];
  missingLocators: string[];
  note: string;
  state: CitationState;
  /** Why the citation is not current, when it is not. */
  reason: string;
}
export interface CheckInput {
  title: string; subtitle: string; author: string; language: string;
  chapters: ChapterInput[];
  /** Image asset ids that are owned by the book owner and ready. */
  readyAssets: ReadonlySet<string>;
  /** The saved book context. Definitions and chapter summaries are optional for contexts stored before S09 added them. */
  context: Omit<BookContext, 'definitions' | 'chapterSummaries'> & Partial<Pick<BookContext, 'definitions' | 'chapterSummaries'>>;
  referencesEnabled: boolean;
  /** Characters that no approved font for this book can draw (from the S08 font registry). */
  uncoveredCharacters: ReadonlySet<string>;
  /** The citations of the book's chapters, with the state of the text they rest on. */
  citations?: CitationInput[];
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
  { id: 'contradiction', label: 'Conflicting numbers and repeated definitions', method: 'rule', scope: 'Same subject and measure across chapters; defined terms' },
  { id: 'language', label: 'Chapters mostly written in another script', method: 'heuristic', scope: 'Script-based; cannot tell languages sharing a script apart' },
  { id: 'typesetting', label: 'Characters no approved font can draw', method: 'rule', scope: 'Bundled S08 fonts' },
  { id: 'evidence', label: 'Statistical and research claims that need a source', method: 'heuristic', scope: 'Percentages in all languages; claim phrases in English only' },
  { id: 'citation', label: 'Citations whose source changed or was deleted', method: 'rule', scope: 'Sources imported into this book; the text is compared, not judged' },
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

/**
 * A measurable claim: the subject it is about, the number and the unit.
 * Two claims that share a subject and unit but report different numbers contradict each other.
 */
interface QuantityClaim { subject: string; value: number; unit: string; quote: string; chapterId: string; block: TextBlock; start: number }
const MEASURE = /(\d+(?:[.,]\d+)?)\s*(%|percent|per cent|minutes?|hours?|days?|weeks?|months?|years?|grams?|kilograms?|g|kg|ml|litres?|liters?|l|calories?|kcal|pieces?|servings?|portions?)(?![a-z])/giu;
const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'it', 'this', 'that', 'these', 'those', 'you', 'your', 'we', 'our', 'they', 'their', 'as', 'at', 'by', 'with', 'from', 'about', 'more', 'most', 'can', 'will', 'up', 'out', 'if', 'not', 'no', 'all', 'each', 'per', 'than', 'then', 'so', 'but']);
/** Verbs and other non-nouns that must not be treated as the measured subject. */
const NOT_SUBJECT = new Set(['takes', 'take', 'took', 'needs', 'need', 'lasts', 'last', 'lasted', 'costs', 'cost', 'makes', 'make', 'means', 'mean', 'serves', 'serve', 'helps', 'help', 'gives', 'give', 'requires', 'require', 'uses', 'use', 'adds', 'add', 'saves', 'save', 'works', 'work', 'runs', 'run', 'seems', 'seem', 'becomes', 'become', 'remains', 'remain']);
/** Words that identify what a number is about. Unit words are excluded: they name the measure, not the subject. */
const SUBJECT = new Set(['parents', 'families', 'children', 'people', 'users', 'customers', 'meals', 'portions', 'servings', 'calories', 'steps', 'recipes', 'containers', 'books', 'readers']);

function subjectOf(sentence: string, numberIndex: number): string {
  // The measured subject usually follows the number ("73% of parents"), so look there first.
  const after = sentence.slice(numberIndex);
  const afterWords = after.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];
  const afterSubject = afterWords.filter(w => SUBJECT.has(w))[0];
  if (afterSubject) return afterSubject;
  const before = sentence.slice(0, numberIndex);
  const beforeWords = before.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];
  const beforeSubject = beforeWords.filter(w => SUBJECT.has(w)).pop();
  if (beforeSubject) return beforeSubject;
  // Fall back to the last noun before the number, skipping verbs and function words.
  const content = beforeWords.filter(w => !STOP_WORDS.has(w) && !NOT_SUBJECT.has(w) && w.length > 2);
  return content.slice(-1)[0] ?? 'unspecified';
}

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
  // Cross-chapter contradictions: measured after every chapter is read, because the comparison spans chapters.
  for (const conflict of findContradictions(input)) {
    add({ ruleId: 'contradiction.value', category: 'contradiction', severity: 'warning', chapterId: conflict.chapterId, anchor: makeAnchor(conflict.chapterId, chapterOf(input, conflict.chapterId).version, conflict.block, conflict.start, conflict.start + conflict.quote.length), message: conflict.message, evidence: conflict.evidence });
  }
  for (const conflict of findDefinitionConflicts(input)) {
    add({ ruleId: 'contradiction.definition', category: 'contradiction', severity: 'warning', chapterId: conflict.chapterId, anchor: conflict.anchor, message: conflict.message, evidence: conflict.evidence });
  }
  for (const gap of findSummaryGaps(input)) {
    add({ ruleId: 'consistency.summary-gap', category: 'consistency', severity: 'info', chapterId: gap.chapterId, anchor: gap.anchor, message: gap.message, evidence: gap.evidence });
  }
  // Citations that no longer rest on the text they were made from.
  for (const citation of input.citations ?? []) {
    const label = `Chapter ${citation.chapterPosition + 1}`;
    if (citation.state === 'deleted') {
      add({
        ruleId: 'citation.source-deleted', category: 'evidence', severity: 'error', chapterId: citation.chapterId, anchor: null,
        message: `${label} cites “${citation.sourceTitle}”, but that source was deleted. The text this citation rests on is gone.`,
        evidence: citation.note || `Cited passages: ${citation.locators.join(', ') || 'none recorded'}.`,
      });
      continue;
    }
    if (citation.state === 'missing-passage') {
      add({
        ruleId: 'citation.passage-missing', category: 'evidence', severity: 'error', chapterId: citation.chapterId, anchor: null,
        message: `${label} cites ${citation.missingLocators.join(', ')} of “${citation.sourceTitle}”, but ${citation.missingLocators.length === 1 ? 'that passage no longer exists' : 'those passages no longer exist'} in the source.`,
        evidence: `Cited passages: ${citation.locators.join(', ')}.`,
      });
      continue;
    }
    if (citation.state === 'changed') {
      add({
        ruleId: 'citation.source-changed', category: 'evidence', severity: 'warning', chapterId: citation.chapterId, anchor: null,
        message: `${label} cites “${citation.sourceTitle}”, but ${citation.reason.toLowerCase()} Check that the chapter still says what the source says.`,
        evidence: `Cited passages: ${citation.locators.join(', ') || 'none recorded'}.`,
      });
      continue;
    }
    if (citation.state === 'unverifiable') {
      add({
        ruleId: 'citation.unverifiable', category: 'evidence', severity: 'info', chapterId: citation.chapterId, anchor: null,
        message: `${label} cites “${citation.sourceTitle}”, but that source has no current text to check the citation against.`,
        evidence: citation.note || `Cited passages: ${citation.locators.join(', ') || 'none recorded'}.`,
      });
    }
  }
  return { findings: out.slice(0, MAX_FINDINGS), truncated: out.length > MAX_FINDINGS };
}

function chapterOf(input: CheckInput, chapterId: string): ChapterInput {
  return input.chapters.find(c => c.id === chapterId)!;
}

/**
 * Finds two measurements of the same subject in the same unit that report different values.
 * Only clearly comparable claims are compared, so this flags a likely contradiction rather than proving one.
 */
function findContradictions(input: CheckInput) {
  const claims: QuantityClaim[] = [];
  for (const chapter of input.chapters) {
    const blocks = textBlocks(chapter.content);
    for (const block of blocks) {
      if (block.type !== 'paragraph') continue;
      for (const sentence of block.text.matchAll(SENTENCE)) {
        const raw = sentence[0];
        const sentenceOffset = sentence.index ?? 0;
        for (const m of raw.matchAll(MEASURE)) {
          const value = Number.parseFloat(m[1].replace(',', '.'));
          if (!Number.isFinite(value)) continue;
          const unit = m[2].toLowerCase().replace(/^(percent|per cent)$/, '%');
          const localStart = m.index ?? raw.indexOf(m[0]);
          const start = sentenceOffset + localStart;
          claims.push({ subject: subjectOf(raw, localStart), value, unit, quote: m[0], chapterId: chapter.id, block, start });
        }
      }
    }
  }
  const conflicts: { chapterId: string; block: TextBlock; start: number; quote: string; message: string; evidence: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i], b = claims[j];
      if (a.chapterId === b.chapterId) continue;              // within a chapter, wording may differ harmlessly
      if (a.subject !== b.subject || a.unit !== b.unit) continue;
      if (a.value === b.value) continue;
      const key = [a.subject, a.unit, Math.min(a.value, b.value), Math.max(a.value, b.value)].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      // Report the later claim so the reader can see it against the earlier one.
      conflicts.push({
        chapterId: b.chapterId, block: b.block, start: b.start, quote: b.quote,
        evidence: `“${a.quote}” (earlier) vs “${b.quote}” (later)`,
        message: `The ${a.subject} is given as ${a.value} ${a.unit} in an earlier chapter and ${b.value} ${b.unit} here. These numbers disagree; check which is correct.`,
      });
    }
  }
  return conflicts;
}

/**
 * Finds a term the author defined in the book context used with a different meaning in a chapter.
 * The check is deliberately narrow: it only fires when the chapter states a competing definition for the same term.
 */
function findDefinitionConflicts(input: CheckInput) {
  const conflicts: { chapterId: string; anchor: TextAnchor; message: string; evidence: string }[] = [];
  for (const def of input.context.definitions ?? []) {
    const pattern = new RegExp(`\\b${def.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'iu');
    for (const chapter of input.chapters) {
      for (const block of textBlocks(chapter.content)) {
        if (block.type !== 'paragraph') continue;
        for (const sentence of block.text.matchAll(SENTENCE)) {
          const raw = sentence[0];
          const m = pattern.exec(raw);
          if (!m) continue;
          // Look for a competing definition: "X is ...", "X means ...", "X refers to ...".
          const definition = new RegExp(`(?:${pattern.source})\\s+(?:is|means|refers\\s+to|denotes|stands\\s+for)\\s+(.{3,140})`, 'iu').exec(raw);
          if (!definition) continue;
          const stated = definition[1].trim().replace(/[.,;].*$/, '').toLowerCase();
          if (!stated || stated === def.definition.trim().toLowerCase()) continue;
          // Only report when the stated meaning shares no significant content with the agreed definition.
          const agreed = new Set(def.definition.toLowerCase().match(/[\p{L}\p{M}]{4,}/gu) ?? []);
          const overlap = (stated.match(/[\p{L}\p{M}]{4,}/gu) ?? []).filter(w => agreed.has(w)).length;
          if (overlap >= 2) continue;
          const start = (sentence.index ?? 0) + raw.indexOf(definition[0]);
          conflicts.push({
            chapterId: chapter.id,
            anchor: makeAnchor(chapter.id, chapter.version, block, start, start + definition[0].length),
            message: `This chapter defines “${def.term}” differently from your book context. Check that both statements agree.`,
            evidence: definition[0].trim(),
          });
        }
      }
    }
  }
  return conflicts;
}

/**
 * The author's own summary of a chapter should be reflected in the chapter text.
 * A summary whose key words never appear in the chapter is usually a summary that has drifted.
 */
function findSummaryGaps(input: CheckInput) {
  const gaps: { chapterId: string; anchor: TextAnchor; message: string; evidence: string }[] = [];
  for (const entry of input.context.chapterSummaries ?? []) {
    const chapter = input.chapters.find(c => c.id === entry.chapterId);
    if (!chapter) continue;
    const blocks = textBlocks(chapter.content);
    const body = blocks.map(b => b.text).join(' ').toLowerCase();
    if (!body.trim()) continue;
    const words = (entry.summary.toLowerCase().match(/[\p{L}\p{M}]{4,}/gu) ?? []).filter(w => !STOP_WORDS.has(w));
    if (!words.length) continue;
    const present = words.filter(w => body.includes(w)).length;
    // Require most content words to appear; a summary of a chapter that has been rewritten will not.
    if (present >= Math.max(1, Math.ceil(words.length * 0.6))) continue;
    const first = blocks.find(b => b.type === 'paragraph');
    if (!first) continue;
    gaps.push({
      chapterId: chapter.id,
      anchor: makeAnchor(chapter.id, chapter.version, first, 0, Math.min(first.text.length, 60)),
      message: 'Your summary of this chapter does not match its text. Either the chapter changed or the summary is out of date.',
      evidence: entry.summary,
    });
  }
  return gaps;
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
