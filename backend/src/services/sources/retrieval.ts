import type { EvidencePassage, SourceAnswer, SourceSummary } from '@ebook/shared';

/**
 * S11 retrieval and citation checking.
 *
 * These functions are deliberately free of any provider or environment
 * dependency: the rule that an answer must point at a real passage is enforced
 * here, so it can be verified without a model call or a database.
 */

/** The passages handed to the model, with the index it must cite. */
export interface RetrievedPassage extends EvidencePassage {
  /** Index used in the prompt and in the citation list. */
  index: number;
}

/** A candidate passage before retrieval ranks it. */
export type CandidatePassage = {
  locator: string;
  sourceId: string;
  sourceTitle: string;
  page: number | null;
  text: string;
};

/**
 * A passage as it may be grouped into a proposal.
 *
 * Only the locator, the text and the recorded heading matter here; the other
 * fields of an extracted passage are accepted so callers can pass a passage
 * list straight through.
 */
export type ProposablePassage = {
  locator: string;
  text: string;
  page?: number | null;
  paragraph?: number;
  truncated?: boolean;
  heading?: string | null;
};

/**
 * Groups passages into proposed chapters.
 *
 * A heading in the source starts a new group, so the proposed chapters follow
 * the document's own structure. The heading is the one the extractor recorded,
 * not one guessed from the text, so a document without headings becomes one
 * proposal, which the author can still split.
 */
export function proposeChapters(passages: ProposablePassage[]): { title: string; locators: string[] }[] {
  const groups: { title: string | null; locators: string[] }[] = [];
  for (const passage of passages) {
    const heading = passage.heading?.trim();
    const current = groups[groups.length - 1];
    // A heading starts a new group the first time it appears. Further passages
    // under the same heading belong to that group.
    if (heading && heading !== current?.title) {
      groups.push({ title: heading, locators: [passage.locator] });
      continue;
    }
    if (!groups.length) groups.push({ title: null, locators: [] });
    groups[groups.length - 1].locators.push(passage.locator);
  }
  const meaningful = groups.filter((g) => g.locators.length);
  if (!meaningful.length) return [];
  return meaningful.map((group, index) => ({
    title: group.title ?? `Imported section ${index + 1}`,
    locators: group.locators,
  }));
}

/** The maximum number of passages quoted to the model. */
export const MAX_RETRIEVED_PASSAGES = 40;

/**
 * Ranks passages against a question.
 *
 * The ranking is a simple term-overlap score. It is deterministic and needs no
 * provider call, so a question that no passage mentions is recognised as
 * unsupported before the model is asked at all.
 */
export function retrievePassages(question: string, passages: CandidatePassage[], limit = MAX_RETRIEVED_PASSAGES): { passages: RetrievedPassage[]; best: number } {
  const terms = question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 2);
  const scored = passages.map((passage) => {
    const text = passage.text.toLowerCase();
    let score = 0;
    for (const term of terms) {
      const hits = text.split(term).length - 1;
      if (hits > 0) score += 1 + Math.min(hits, 4) * 0.25;
    }
    return { passage, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ?? 0;
  const chosen = scored.filter((s) => s.score > 0).slice(0, limit);
  return {
    passages: chosen.map((s, index) => ({
      index,
      locator: s.passage.locator,
      sourceId: s.passage.sourceId,
      sourceTitle: s.passage.sourceTitle,
      page: s.passage.page,
      text: s.passage.text,
    })),
    best,
  };
}

/** A draft answer as the model returns it. */
export interface AnswerDraft {
  outcome: 'supported' | 'unsupported';
  answer: string;
  reason: string;
  /** Indices of the passages that support the answer. */
  citations: number[];
}

/** A draft summary as the model returns it. */
export interface SummaryDraft {
  outcome: 'summary' | 'unsupported';
  summary: string;
  reason: string;
  citations: number[];
}

/** The passages a draft actually cites, ignoring indices that do not exist. */
function usablePassages(draft: { citations: number[] }, passages: RetrievedPassage[]): RetrievedPassage[] {
  const seen = new Set<number>();
  const usable: RetrievedPassage[] = [];
  for (const index of draft.citations) {
    if (seen.has(index)) continue;
    const passage = passages.find((p) => p.index === index);
    if (!passage) continue;
    seen.add(index);
    usable.push(passage);
  }
  return usable;
}

/** The evidence shape shared by answers and summaries. */
function evidenceOf(passages: RetrievedPassage[]): EvidencePassage[] {
  return passages.map((p) => ({ locator: p.locator, sourceId: p.sourceId, sourceTitle: p.sourceTitle, page: p.page, text: p.text }));
}

/**
 * Turns a draft into a final answer.
 *
 * A citation that does not point at a real passage is dropped. When the model
 * claims support but names no usable passage, the answer becomes an
 * abstention: an unsupported answer is worse than an honest one.
 */
export function finalizeAnswer(draft: AnswerDraft, passages: RetrievedPassage[]): SourceAnswer {
  const usable = usablePassages(draft, passages);
  if (draft.outcome === 'unsupported') {
    return {
      outcome: 'unsupported',
      answer: '',
      reason: draft.reason.trim() || 'The sources do not contain enough to answer this question.',
      evidence: [],
      sourceIds: [...new Set(passages.map((p) => p.sourceId))],
    };
  }
  if (!usable.length) {
    return {
      outcome: 'unsupported',
      answer: '',
      reason: 'The answer could not be tied to a specific passage in the sources.',
      evidence: [],
      sourceIds: [...new Set(passages.map((p) => p.sourceId))],
    };
  }
  return {
    outcome: 'supported',
    answer: draft.answer.trim(),
    reason: '',
    evidence: evidenceOf(usable),
    sourceIds: [...new Set(usable.map((p) => p.sourceId))],
  };
}

/** The same rule for a summary. */
export function finalizeSummary(draft: SummaryDraft, passages: RetrievedPassage[]): SourceSummary {
  const usable = usablePassages(draft, passages);
  if (draft.outcome === 'unsupported') {
    return {
      outcome: 'unsupported',
      summary: '',
      reason: draft.reason.trim() || 'The sources do not contain enough to summarize.',
      evidence: [],
      sourceIds: [...new Set(passages.map((p) => p.sourceId))],
    };
  }
  if (!usable.length) {
    return {
      outcome: 'unsupported',
      summary: '',
      reason: 'The summary could not be tied to a specific passage in the sources.',
      evidence: [],
      sourceIds: [...new Set(passages.map((p) => p.sourceId))],
    };
  }
  return {
    outcome: 'summary',
    summary: draft.summary.trim(),
    reason: '',
    evidence: evidenceOf(usable),
    sourceIds: [...new Set(usable.map((p) => p.sourceId))],
  };
}
