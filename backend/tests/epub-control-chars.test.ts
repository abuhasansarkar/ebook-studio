import { describe, expect, it } from 'vitest';
import { exportOptionsSchema, type EpubExportOptions, type DocxExportOptions } from '@ebook/shared';
import { renderEpub } from '../src/services/exports/epubRenderer.js';
import { renderDocx } from '../src/services/exports/docxRenderer.js';
import { escapeHtml, stripXmlIllegal } from '../src/services/exports/tiptapToHtml.js';
import { validateExport } from '../src/services/exports/validators.js';
import { readZip } from '../src/services/exports/zip.js';
import { testDocument } from './design-fixtures.js';

/** Every C0 control except tab, newline and carriage return, plus U+FFFE/U+FFFF and a lone surrogate. */
const ILLEGAL = Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).filter((c) => !'\t\n\r'.includes(c)).join('') + '￾￿\ud800';

function dirtyDocument() {
  const doc = testDocument({
    title: `Bad${ILLEGAL}Title`, subtitle: `Sub\u0001title`, author: `Au\u0008thor`,
    chapters: [{
      title: `Chapter\u000bOne`,
      content: { type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: `Body${ILLEGAL} & <text> "quoted" 'single' 😀` }] },
        { type: 'image', attrs: { assetId: 'missing', alt: `Alt\u0002 & <b>` } },
      ] },
    }],
  });
  const m = doc.design.data.matter;
  m.aboutAuthor = { ...m.aboutAuthor, enabled: true, title: `About\u0003`, text: `Bio\u0004 line\n\nSecond\u001f para` };
  m.references = { ...m.references, enabled: true, title: `Refs\u0005`, text: `Ref one\u0006\nRef two` };
  return doc;
}

describe('XML-illegal characters', () => {
  it('are stripped by escapeHtml without touching legal text', () => {
    expect(stripXmlIllegal(`a${ILLEGAL}b\t\n\r😀`)).toBe('ab\t\n\r😀');
    expect(escapeHtml(`x\u0000<y>&`)).toBe('x&lt;y&gt;&amp;');
  });

  it('never reach an EPUB, which then validates', async () => {
    const doc = dirtyDocument();
    const options = exportOptionsSchema.parse({ format: 'epub', options: { includeMatter: true } }).options as EpubExportOptions;
    const { buffer } = renderEpub({ doc, design: doc.design.data, images: new Map(), cover: null, availableFonts: new Set(), rtl: false }, options);
    for (const entry of readZip(buffer)) {
      if (!/\.(xhtml|opf|xml)$/.test(entry.name)) continue;
      const xml = entry.data.toString('utf8');
      expect(xml, entry.name).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/);
      // Alt text is escaped exactly once.
      expect(xml).not.toContain('&amp;amp;');
    }
    const chapter = readZip(buffer).find((e) => e.name.includes('chapter-1'))!.data.toString('utf8');
    expect(chapter).toContain('Body &amp; &lt;text&gt; &quot;quoted&quot; &apos;single&apos; 😀');
    expect(chapter).toContain('Alt &amp; &lt;b&gt;');
    const validation = await validateExport({ format: 'epub', buffer, renderFacts: {} });
    expect(validation.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(validation.passed).toBe(true);
  });

  it('never reach a DOCX either', async () => {
    const doc = dirtyDocument();
    const options = exportOptionsSchema.parse({ format: 'docx', options: {} }).options as DocxExportOptions;
    const { buffer } = renderDocx({ doc, design: doc.design.data, images: new Map(), cover: null, availableFonts: new Set(), rtl: false }, options);
    for (const entry of readZip(buffer)) {
      if (entry.name.endsWith('.xml')) expect(entry.data.toString('utf8'), entry.name).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
    }
  });
});
