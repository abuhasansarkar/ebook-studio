import { imageAssetIds, type BookDesign } from '@ebook/shared';
import { serviceUnavailable } from '../../utils/errors.js';
import { assetService } from '../assets/assetService.js';
import { EXPORT_FONT_ORIGIN, renderBookHtml } from '../exports/bookHtml.js';
import { renderPdf, textBlockWidth } from '../exports/pdfRenderer.js';
import { assertRenderable, buildBookDocument, documentDiagnostics } from './bookDocument.js';
import { designService } from './designService.js';
import { fontRegistry } from './fonts.js';

/** Print samples cover the front matter plus this many chapters; full files come from Export. */
export const PRINT_SAMPLE_CHAPTERS = 3;
let printing = 0;

async function resolveDesign(userId: string, bookId: string, source: { version?: number; draft?: BookDesign }) {
  if (source.draft) {
    const latest = await designService.get(userId, bookId);
    return { version: latest.version, data: source.draft, draft: true };
  }
  const saved = await designService.get(userId, bookId, source.version);
  return { version: saved.version, data: saved.data, draft: false };
}
export const previewService = {
  /** Reflowable reader HTML. Fonts and images load through owner-authenticated routes; nothing is persisted. */
  async reader(userId: string, bookId: string, source: { version?: number; draft?: BookDesign }) {
    const design = await resolveDesign(userId, bookId, source);
    const doc = await buildBookDocument(userId, bookId, design);
    const diagnostics = await documentDiagnostics(doc);
    const images = Object.fromEntries([...new Set(doc.chapters.flatMap(c => imageAssetIds(c.content)))].map(id => [id, `/api/v1/assets/${id}/content`]));
    const html = renderBookHtml(doc, { mode: 'reader', fontSrc: id => `/api/v1/design-fonts/${id}`, images, available: await fontRegistry.available() });
    return {
      html, diagnostics, design: { version: design.version, draft: design.draft },
      chapters: doc.chapters.map(c => ({ id: c.id, version: c.version, title: c.title })),
    };
  },
  /** A real PDF sample rendered through the export pipeline (same fonts, CSS and Chromium version). */
  async print(userId: string, bookId: string, source: { version?: number; draft?: BookDesign }) {
    const design = await resolveDesign(userId, bookId, source);
    const doc = await buildBookDocument(userId, bookId, design, { chapterLimit: PRINT_SAMPLE_CHAPTERS });
    await assertRenderable(doc);
    if (printing >= 2) throw serviceUnavailable('Print previews are busy. Please retry shortly.');
    printing++;
    try {
      const images = await assetService.exportImages(userId, doc.chapters.map(c => c.content));
      const html = renderBookHtml(doc, { mode: 'print', fontSrc: id => EXPORT_FONT_ORIGIN + id, images, available: await fontRegistry.available() });
      const pdf = await renderPdf(html, { textBlockWidthIn: textBlockWidth(doc.design.data) });
      return { ...pdf, partial: doc.partial, chapters: doc.chapters.length };
    } finally { printing--; }
  },
};
