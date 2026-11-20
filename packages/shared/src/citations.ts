/**
 * S11 citation-impact contract.
 *
 * A chapter citation names the source passages that support it. That link can
 * stop matching the text it was made from: the author can delete the source, or
 * re-upload it so the passages hold different words. The assessment below is
 * the single place that decides what state a citation is in, so the research
 * workspace and the quality report cannot disagree about it.
 */

/**
 * The state of a citation.
 *
 * - `current`: the cited passages still exist and still read the same.
 * - `changed`: the source has a newer extraction, or the cited passages now
 *   hold different text.
 * - `missing-passage`: a cited locator no longer exists in the source.
 * - `deleted`: the source was deleted.
 * - `unverifiable`: the source has no current extraction to compare against.
 */
export const CITATION_STATES = ['current', 'changed', 'missing-passage', 'deleted', 'unverifiable'] as const;
export type CitationState = typeof CITATION_STATES[number];

export const CITATION_STATE_LABELS: Record<CitationState, string> = {
  current: 'Current',
  changed: 'Source changed',
  'missing-passage': 'Passage missing',
  deleted: 'Source deleted',
  unverifiable: 'Not verifiable',
};

export interface CitationAssessmentInput {
  /** The version of the source that was current when the link was made. */
  linkedVersion: number;
  /** The source's current version number; 0 when nothing has been extracted. */
  currentVersion: number;
  /** True when the source was deleted. */
  sourceDeleted: boolean;
  /** The source's current extraction state. */
  sourceStatus: string;
  /** The locators the link cites. */
  locators: string[];
  /** The locators that exist in the source's current extraction. */
  availableLocators: string[];
  /** The digest recorded when the link was made. */
  linkedDigest: string;
  /** The digest of the same locators in the current extraction. */
  currentDigest: string;
}

export interface CitationAssessment {
  state: CitationState;
  /** True when the citation no longer rests on the text it was made from. */
  changed: boolean;
  /** The cited locators that no longer exist. */
  missingLocators: string[];
  /** A short explanation suitable for a finding message. */
  reason: string;
}

/**
 * Decides what state a citation is in.
 *
 * The order matters: a deleted source is reported as deleted even when its
 * passages are also gone, because that is the more important fact for the
 * author. A missing passage outranks a changed text, because a citation whose
 * passage no longer exists cannot be checked against anything.
 */
export function assessCitation(input: CitationAssessmentInput): CitationAssessment {
  const missingLocators = input.locators.filter((l) => !input.availableLocators.includes(l));

  if (input.sourceDeleted) {
    return {
      state: 'deleted',
      changed: true,
      missingLocators,
      reason: 'The source was deleted, so the text this citation rests on is gone.',
    };
  }

  if (missingLocators.length) {
    return {
      state: 'missing-passage',
      changed: true,
      missingLocators,
      reason: missingLocators.length === 1
        ? `The cited passage ${missingLocators[0]} no longer exists in the source.`
        : `${missingLocators.length} cited passages no longer exist in the source.`,
    };
  }

  if (input.currentVersion === 0 || input.sourceStatus !== 'ready') {
    return {
      state: 'unverifiable',
      changed: true,
      missingLocators,
      reason: 'The source has no current text to check this citation against.',
    };
  }

  if (input.linkedVersion !== input.currentVersion || input.linkedDigest !== input.currentDigest) {
    return {
      state: 'changed',
      changed: true,
      missingLocators,
      reason: input.linkedVersion !== input.currentVersion
        ? `The source was re-imported (version ${input.linkedVersion} became version ${input.currentVersion}), so the cited text may have changed.`
        : 'The cited passages now hold different text than when the citation was made.',
    };
  }

  return { state: 'current', changed: false, missingLocators, reason: '' };
}

/**
 * The digest of the cited passages.
 *
 * The digest covers the locator and the text of each cited passage, so a change
 * to either is detected. It is computed over the passages in locator order, so
 * the same citations always produce the same digest.
 */
export function citationDigest(passages: { locator: string; text: string }[]): string {
  const ordered = [...passages].sort((a, b) => a.locator.localeCompare(b.locator, 'en', { numeric: true }));
  // A 32-bit FNV-1a hash. The digest only has to notice that the text changed;
  // it is not a security control, so it is kept free of a Node dependency and
  // usable in every target the shared package is compiled for.
  let hash = 0x811c9dc5;
  for (const passage of ordered) {
    for (const char of `${passage.locator}\u0000${passage.text}\u0001`) {
      hash ^= char.codePointAt(0) ?? 0;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

/** The digest of the passages a link cites, taken from one extraction. */
export function digestOfLocators(
  passages: { locator: string; text: string }[],
  locators: string[],
): string {
  const wanted = new Set(locators);
  return citationDigest(passages.filter((p) => wanted.has(p.locator)));
}
