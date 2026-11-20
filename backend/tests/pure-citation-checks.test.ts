import { describe, expect, it } from 'vitest';
import { assessCitation, citationDigest, digestOfLocators } from '@ebook/shared';
import { runRuleChecks, type CitationInput } from '../src/services/quality/checks.js';

/**
 * S11 citation-impact pure tests.
 *
 * These run without a database. They cover the shared assessment that decides
 * what state a citation is in, and the quality rules that turn a citation that
 * no longer holds into a finding.
 */

const PASSAGES = [
  { locator: 'p1', text: 'Keep leafy greens in a crisper drawer.' },
  { locator: 'p2', text: 'Cool cooked food within two hours.' },
];

/** A citation that still holds. */
const current = (overrides: Partial<CitationInput> = {}): CitationInput => ({
  chapterId: 'chapter-1',
  chapterPosition: 0,
  sourceTitle: 'Kitchen notes',
  locators: ['p1'],
  missingLocators: [],
  note: '',
  state: 'current',
  reason: '',
  ...overrides,
});

describe('citation digest', () => {
  it('is the same for the same passages', () => {
    expect(citationDigest(PASSAGES)).toBe(citationDigest([...PASSAGES].reverse()));
  });

  it('changes when the text changes', () => {
    expect(citationDigest(PASSAGES)).not.toBe(citationDigest([{ locator: 'p1', text: 'Different words.' }]));
  });

  it('changes when the locator changes', () => {
    expect(citationDigest(PASSAGES)).not.toBe(citationDigest([{ locator: 'p9', text: PASSAGES[0].text }]));
  });

  it('covers only the cited locators', () => {
    const all = digestOfLocators(PASSAGES, ['p1']);
    const one = digestOfLocators(PASSAGES, ['p1']);
    expect(all).toBe(one);
    expect(digestOfLocators(PASSAGES, ['p1', 'p2'])).not.toBe(all);
  });
});

describe('citation assessment', () => {
  const base = {
    linkedVersion: 1,
    currentVersion: 1,
    sourceDeleted: false,
    sourceStatus: 'ready',
    locators: ['p1'],
    availableLocators: ['p1', 'p2'],
    linkedDigest: digestOfLocators(PASSAGES, ['p1']),
    currentDigest: digestOfLocators(PASSAGES, ['p1']),
  };

  it('reports a citation that still holds as current', () => {
    const result = assessCitation(base);
    expect(result.state).toBe('current');
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('');
  });

  it('reports a deleted source as deleted', () => {
    const result = assessCitation({ ...base, sourceDeleted: true });
    expect(result.state).toBe('deleted');
    expect(result.changed).toBe(true);
    expect(result.reason).toContain('deleted');
  });

  it('reports a missing passage', () => {
    const result = assessCitation({ ...base, locators: ['p9'], availableLocators: ['p1'] });
    expect(result.state).toBe('missing-passage');
    expect(result.missingLocators).toEqual(['p9']);
    expect(result.reason).toContain('p9');
  });

  it('reports a source that was re-imported as changed', () => {
    const result = assessCitation({ ...base, currentVersion: 2 });
    expect(result.state).toBe('changed');
    expect(result.changed).toBe(true);
    expect(result.reason).toContain('version 1');
  });

  it('reports revised text in the same version as changed', () => {
    const result = assessCitation({ ...base, currentDigest: digestOfLocators([{ locator: 'p1', text: 'Rewritten.' }], ['p1']) });
    expect(result.state).toBe('changed');
    expect(result.reason).toContain('different text');
  });

  it('reports a source with no text as unverifiable', () => {
    const result = assessCitation({ ...base, sourceStatus: 'failed' });
    expect(result.state).toBe('unverifiable');
    expect(result.changed).toBe(true);
  });

  it('reports a source with no extraction as unverifiable', () => {
    expect(assessCitation({ ...base, currentVersion: 0 }).state).toBe('unverifiable');
  });

  it('prefers deleted over missing, because that is the more important fact', () => {
    const result = assessCitation({ ...base, sourceDeleted: true, locators: ['p9'], availableLocators: [] });
    expect(result.state).toBe('deleted');
  });

  it('prefers missing over changed, because a gone passage cannot be checked', () => {
    const result = assessCitation({ ...base, currentVersion: 2, locators: ['p9'], availableLocators: ['p1'] });
    expect(result.state).toBe('missing-passage');
  });
});

describe('citation quality rules', () => {
  /** The smallest book the rule engine accepts. */
  const book = {
    title: 'A Practical Guide',
    subtitle: '',
    author: 'Tester',
    language: 'en',
    chapters: [{ id: 'chapter-1', version: 0, position: 0, title: 'Chapter', content: null, wordCount: 0, targetWords: 1500 }],
    readyAssets: new Set<string>(),
    context: { voice: '', terms: [], definitions: [], chapterSummaries: [] },
    referencesEnabled: false,
    uncoveredCharacters: new Set<string>(),
  };

  it('reports a deleted source as an error on the chapter', () => {
    const { findings } = runRuleChecks({
      ...book,
      citations: [current({ state: 'deleted', reason: 'The source was deleted, so the text this citation rests on is gone.' })],
    });
    const finding = findings.find((f) => f.ruleId === 'citation.source-deleted');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('error');
    expect(finding!.category).toBe('evidence');
    expect(finding!.chapterId).toBe('chapter-1');
    expect(finding!.message).toContain('Kitchen notes');
  });

  it('reports a missing passage as an error naming the passage', () => {
    const { findings } = runRuleChecks({
      ...book,
      citations: [current({ state: 'missing-passage', missingLocators: ['p9'], reason: 'gone' })],
    });
    const finding = findings.find((f) => f.ruleId === 'citation.passage-missing');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('error');
    expect(finding!.message).toContain('p9');
  });

  it('reports a changed source as a warning', () => {
    const { findings } = runRuleChecks({
      ...book,
      citations: [current({ state: 'changed', reason: 'The source was re-imported (version 1 became version 2), so the cited text may have changed.' })],
    });
    const finding = findings.find((f) => f.ruleId === 'citation.source-changed');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warning');
    expect(finding!.message).toContain('re-imported');
  });

  it('reports an unverifiable source as information', () => {
    const { findings } = runRuleChecks({
      ...book,
      citations: [current({ state: 'unverifiable', reason: 'no current text' })],
    });
    const finding = findings.find((f) => f.ruleId === 'citation.unverifiable');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('info');
  });

  it('says nothing about a citation that still holds', () => {
    const { findings } = runRuleChecks({ ...book, citations: [current()] });
    expect(findings.filter((f) => f.ruleId.startsWith('citation.'))).toHaveLength(0);
  });

  it('works for a book with no citations at all', () => {
    const { findings } = runRuleChecks(book);
    expect(findings.filter((f) => f.ruleId.startsWith('citation.'))).toHaveLength(0);
  });
});
