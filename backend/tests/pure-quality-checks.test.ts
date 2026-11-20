import { describe, expect, it } from 'vitest';
import { locateAnchor, textBlocks } from '@ebook/shared';
import { runRuleChecks } from '../src/services/quality/checks.js';
import { contradictionInput, noContradictionInput } from './quality-fixtures.js';

/**
 * Database-free tests for the deterministic rule checks.
 * These cover the cross-chapter contradiction detection added with S09 completion.
 */
describe('cross-chapter contradiction detection', () => {
  it('flags conflicting numbers between chapters and points at the later claim', () => {
    const input = contradictionInput();
    const { findings } = runRuleChecks(input);
    const conflict = findings.find(f => f.ruleId === 'contradiction.value');
    expect(conflict).toBeDefined();
    expect(conflict).toMatchObject({ category: 'contradiction', chapterId: 'ch1', method: 'rule' });
    expect(conflict!.anchor?.quote).toBe('41%');
    const chapter = input.chapters.find(c => c.id === 'ch1')!;
    expect(locateAnchor(textBlocks(chapter.content), conflict!.anchor!).status).toBe('current');
    expect(conflict!.message).toContain('73');
    expect(conflict!.message).toContain('41');
  });

  it('flags a chapter that defines a book-context term differently', () => {
    const input = contradictionInput();
    const { findings } = runRuleChecks(input);
    const conflict = findings.find(f => f.ruleId === 'contradiction.definition');
    expect(conflict).toBeDefined();
    expect(conflict).toMatchObject({ category: 'contradiction', chapterId: 'ch2' });
    expect(conflict!.message).toContain('batch cooking');
    const chapter = input.chapters.find(c => c.id === 'ch2')!;
    expect(locateAnchor(textBlocks(chapter.content), conflict!.anchor!).status).toBe('current');
  });

  it('stays silent on the same book when the numbers agree and the definition matches', () => {
    const rules = runRuleChecks(noContradictionInput()).findings.map(f => f.ruleId);
    expect(rules.filter(r => r.startsWith('contradiction.'))).toEqual([]);
    expect(rules.filter(r => r === 'consistency.summary-gap')).toEqual([]);
  });

  it('flags a chapter summary that no longer matches its chapter', () => {
    const input = noContradictionInput();
    input.context = { ...input.context, chapterSummaries: [{ chapterId: 'ch2', summary: 'This chapter explains budgeting and seasonal produce.' }] };
    const { findings } = runRuleChecks(input);
    const gap = findings.find(f => f.ruleId === 'consistency.summary-gap');
    expect(gap).toBeDefined();
    expect(gap).toMatchObject({ chapterId: 'ch2', category: 'consistency', severity: 'info' });
    expect(gap!.evidence).toContain('budgeting');
  });

  it('does not compare two numbers from the same chapter', () => {
    const input = noContradictionInput();
    // Remove the other chapter's matching percentage so only the single-chapter case remains.
    input.chapters[0].content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A first survey put the figure at 55%.' }] }],
    } as never;
    input.chapters[1].content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One survey said 73% of parents skip breakfast, and another said 41%.' }] }],
    } as never;
    expect(runRuleChecks(input).findings.filter(f => f.ruleId === 'contradiction.value')).toEqual([]);
  });

  it('does not compare the same subject measured in different units', () => {
    const input = noContradictionInput();
    input.chapters[1].content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Each family needs 30 minutes for prep and 2 hours of cooking.' }] }],
    } as never;
    expect(runRuleChecks(input).findings.filter(f => f.ruleId === 'contradiction.value')).toEqual([]);
  });

  it('treats the noun before the number as the subject, not the unit word', () => {
    const input = noContradictionInput();
    input.chapters[0].content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Each session takes 30 minutes to prepare.' }] }],
    } as never;
    input.chapters[1].content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Each session takes 45 minutes to prepare.' }] }],
    } as never;
    // These do contradict each other, and the subject must be "session", not "minutes".
    const conflict = runRuleChecks(input).findings.find(f => f.ruleId === 'contradiction.value');
    expect(conflict).toBeDefined();
    expect(conflict!.message).toContain('session');
    expect(conflict!.message).not.toContain('minutes is given');
  });

  it('treats a context saved before definitions existed as empty rather than failing', () => {
    const input = noContradictionInput();
    input.context = { voice: '', terms: [] } as never;
    expect(() => runRuleChecks(input)).not.toThrow();
  });
});
