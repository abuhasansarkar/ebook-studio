import { describe, expect, it } from 'vitest';
import { MAX_PASSAGE_CHARACTERS, splitPassages } from '@ebook/shared';
import { finalizeAnswer, finalizeSummary, proposeChapters, retrievePassages } from '../src/services/sources/retrieval.js';
import { assertAcceptableSource, extractDocx, extractNotes } from '../src/services/sources/extractors.js';
import { buildZip } from '../src/services/exports/zip.js';

/**
 * S11 pure tests.
 *
 * These run without a database: extraction, passage splitting, retrieval and the
 * rule that an answer without a verifiable passage becomes an abstention.
 */

describe('passage splitting', () => {
  it('gives every passage a stable locator', () => {
    const passages = splitPassages('First block.\n\nSecond block.\n\nThird block.');
    expect(passages.map((p) => p.locator)).toEqual(['p1', 'p2', 'p3']);
    expect(passages[1].text).toBe('Second block.');
  });

  it('drops empty blocks', () => {
    const passages = splitPassages('\n\n   \n\nOnly this.\n\n');
    expect(passages).toHaveLength(1);
    expect(passages[0].text).toBe('Only this.');
  });

  it('splits a very long paragraph and says so', () => {
    const long = `${'word '.repeat(4000).trim()}.`;
    const passages = splitPassages(long);
    expect(passages.length).toBeGreaterThan(1);
    for (const passage of passages) expect(passage.text.length).toBeLessThanOrEqual(MAX_PASSAGE_CHARACTERS + 200);
    expect(passages.some((p) => p.truncated)).toBe(true);
  });

  it('keeps page numbers when the format has pages', () => {
    const passages = splitPassages('', { pages: [{ page: 3, text: 'On page three.' }] });
    expect(passages[0].page).toBe(3);
    expect(passages[0].text).toBe('On page three.');
  });
});

describe('notes extraction', () => {
  it('keeps headings with their text', () => {
    const result = extractNotes(Buffer.from('# Batch cooking\n\nSaves time.\n\n# Freezing\n\nKeeps food safe.', 'utf8'));
    expect(result.status).toBe('ready');
    const text = result.passages.map((p) => p.text).join('\n');
    expect(text).toContain('Batch cooking');
    expect(text).toContain('Keeps food safe.');
  });

  it('reports an empty file', () => {
    const result = extractNotes(Buffer.from('   \n\n  ', 'utf8'));
    expect(result.status).toBe('empty');
    expect(result.passages).toHaveLength(0);
  });

  it('rejects binary content in a text file', () => {
    const result = extractNotes(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]));
    expect(result.status).toBe('failed');
  });

  it('numbers passages across the whole document, not per heading', () => {
    const result = extractNotes(
      Buffer.from('# One\n\nFirst.\n\n# Two\n\nSecond.\n\n# Three\n\nThird.', 'utf8'),
    );
    // Each section is one passage: the heading stays with its own text.
    expect(result.passages.map((p) => p.locator)).toEqual(['p1', 'p2', 'p3']);
    expect(result.passages.map((p) => p.heading)).toEqual(['One', 'Two', 'Three']);
    // A locator must identify one passage, so none may repeat.
    const locators = result.passages.map((p) => p.locator);
    expect(new Set(locators).size).toBe(locators.length);
  });
});

describe('DOCX extraction', () => {
  const docx = (paragraphs: string[]) => {
    const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join('');
    return buildZip([
      { name: '[Content_Types].xml', data: Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>') },
      { name: 'word/document.xml', data: Buffer.from(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`) },
    ]);
  };

  it('reads the paragraphs of a Word document', () => {
    const result = extractDocx(docx(['First paragraph.', 'Second paragraph.']));
    expect(result.status).toBe('ready');
    const text = result.passages.map((p) => p.text).join(' ');
    expect(text).toContain('First paragraph.');
    expect(text).toContain('Second paragraph.');
  });

  it('unescapes XML entities so the text is readable', () => {
    const result = extractDocx(docx(['Tom &amp; Jerry said &quot;hello&quot;.']));
    expect(result.passages[0].text).toContain('Tom & Jerry said "hello".');
  });

  it('reports a document that is not a real Word file', () => {
    const broken = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(32, 9)]);
    const result = extractDocx(broken);
    expect(result.status).toBe('failed');
    expect(result.warnings[0].message).toMatch(/damaged|not a real/i);
  });

  it('reports a Word file without a main document part', () => {
    const result = extractDocx(buildZip([{ name: '[Content_Types].xml', data: Buffer.from('<Types/>') }]));
    expect(result.status).toBe('failed');
    expect(result.warnings[0].code).toBe('docx.no_document');
  });
});

describe('upload acceptance', () => {
  it('rejects a file whose type does not match its bytes', () => {
    expect(() => assertAcceptableSource(Buffer.from('PK\x03\x04rest'), 'text/plain', 'notes')).toThrow();
    expect(() => assertAcceptableSource(Buffer.from('%PDF-1.4'), 'application/pdf', 'docx')).toThrow();
  });

  it('rejects an empty file', () => {
    expect(() => assertAcceptableSource(Buffer.alloc(0), 'text/plain', 'notes')).toThrow();
  });

  it('accepts a matching file', () => {
    expect(() => assertAcceptableSource(Buffer.from('hello'), 'text/plain', 'notes')).not.toThrow();
  });
});

describe('proposed chapters', () => {
  it('groups passages into proposals', () => {
    const proposals = proposeChapters([
      { locator: 'p1', page: null, paragraph: 1, text: 'Saves time.', truncated: false },
      { locator: 'p2', page: null, paragraph: 2, text: 'Keeps food safe.', truncated: false },
    ]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].locators).toEqual(['p1', 'p2']);
  });

  it('starts a new proposal at every recorded heading', () => {
    const proposals = proposeChapters([
      { locator: 'p1', page: null, paragraph: 1, text: 'Fresh produce\nKeep greens cold.', truncated: false, heading: 'Fresh produce' },
      { locator: 'p2', page: null, paragraph: 2, text: 'Root vegetables belong in a cupboard.', truncated: false, heading: 'Fresh produce' },
      { locator: 'p3', page: null, paragraph: 3, text: 'Leftovers\nCool cooked food quickly.', truncated: false, heading: 'Leftovers' },
    ]);
    expect(proposals.map((p) => p.title)).toEqual(['Fresh produce', 'Leftovers']);
    expect(proposals[0].locators).toEqual(['p1', 'p2']);
    expect(proposals[1].locators).toEqual(['p3']);
  });

  it('follows the headings the extractor recorded', () => {
    const extracted = extractNotes(
      Buffer.from('# Fresh produce\n\nKeep greens cold.\n\n# Leftovers\n\nCool cooked food quickly.', 'utf8'),
    );
    const proposals = proposeChapters(extracted.passages);
    expect(proposals.map((p) => p.title)).toEqual(['Fresh produce', 'Leftovers']);
  });

  it('returns nothing for a source with no passages', () => {
    expect(proposeChapters([])).toEqual([]);
  });
});

describe('retrieval', () => {
  const passages = [
    { locator: 'p1', sourceId: 's1', sourceTitle: 'Notes', page: null, text: 'Batch cooking saves time on busy weeknights.' },
    { locator: 'p2', sourceId: 's1', sourceTitle: 'Notes', page: null, text: 'Cooking oil should be stored away from heat.' },
  ];

  it('finds the passage that shares terms with the question', () => {
    const { passages: found } = retrievePassages('Does batch cooking save time?', passages);
    expect(found.length).toBeGreaterThan(0);
    // The strongest match comes first.
    expect(found[0].locator).toBe('p1');
  });

  it('finds nothing when no passage mentions the question', () => {
    const { passages: found } = retrievePassages('Which telescopes did the Mughal emperors use?', passages);
    expect(found).toHaveLength(0);
  });
});

describe('answer verification', () => {
  const retrieved = [
    { index: 0, locator: 'p1', sourceId: 's1', sourceTitle: 'Notes', page: null, text: 'Batch cooking saves time.' },
  ];

  it('keeps an answer whose citation points at a real passage', () => {
    const answer = finalizeAnswer({ outcome: 'supported', answer: 'Yes it does.', reason: '', citations: [0] }, retrieved);
    expect(answer.outcome).toBe('supported');
    expect(answer.evidence).toHaveLength(1);
    expect(answer.evidence[0].locator).toBe('p1');
  });

  it('turns an answer with an invented citation into an abstention', () => {
    const answer = finalizeAnswer({ outcome: 'supported', answer: 'A confident claim.', reason: '', citations: [99] }, retrieved);
    expect(answer.outcome).toBe('unsupported');
    expect(answer.answer).toBe('');
    expect(answer.evidence).toEqual([]);
  });

  it('turns an answer with no citation into an abstention', () => {
    const answer = finalizeAnswer({ outcome: 'supported', answer: 'A confident claim.', reason: '', citations: [] }, retrieved);
    expect(answer.outcome).toBe('unsupported');
  });

  it('keeps an explicit abstention', () => {
    const answer = finalizeAnswer({ outcome: 'unsupported', answer: '', reason: 'No source mentions it.', citations: [] }, retrieved);
    expect(answer.outcome).toBe('unsupported');
    expect(answer.reason).toBe('No source mentions it.');
  });

  it('applies the same rule to a summary', () => {
    expect(finalizeSummary({ outcome: 'summary', summary: 'A summary.', reason: '', citations: [0] }, retrieved).outcome).toBe('summary');
    expect(finalizeSummary({ outcome: 'summary', summary: 'A summary.', reason: '', citations: [7] }, retrieved).outcome).toBe('unsupported');
  });
});
