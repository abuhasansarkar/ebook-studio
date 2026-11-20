import {
  EXPORT_CONTENT_TYPES,
  type ExportFormat,
  type ExportOptions,
  type PdfExportOptions,
} from '@ebook/shared';
import { renderBookHtml, EXPORT_FONT_ORIGIN } from './bookHtml.js';
import { renderDocx } from './docxRenderer.js';
import { renderEpub } from './epubRenderer.js';
import { renderPdf, textBlockWidth } from './pdfRenderer.js';
import type { RenderInput, RenderedFile } from './renderTypes.js';

/**
 * S10 renderer registry.
 *
 * Every export format is produced here from the same normalized book document,
 * so the PDF, EPUB and DOCX outputs of one book always carry the same text,
 * images and front/back matter.
 */

export interface RenderResult extends RenderedFile {
  /** MIME type of the produced file. */
  contentType: string;
  /** Extension without the dot. */
  extension: string;
}

/** Renders a fixed-layout or digital PDF. */
async function renderPdfFormat(input: RenderInput, options: PdfExportOptions): Promise<RenderResult> {
  const layout = options.layout;
  // Images are supplied as data URIs so the renderer never reaches the network.
  // A digital PDF has no fixed page geometry, so it uses the reader geometry.
  const html = renderBookHtml(input.doc, {
    mode: layout === 'print' ? 'print' : 'reader',
    fontSrc: (id) => EXPORT_FONT_ORIGIN + id,
    images: dataUris(input),
    available: input.availableFonts,
    includeMatter: options.includeMatter,
    includeToc: options.includeToc,
  });
  const rendered = await renderPdf(html, {
    textBlockWidthIn: layout === 'print' ? textBlockWidth(input.design) : undefined,
  });
  return {
    buffer: rendered.buffer,
    contentType: EXPORT_CONTENT_TYPES.pdf,
    extension: 'pdf',
    facts: {
      layout,
      pageCount: rendered.pageCount,
      foreignFonts: rendered.foreignFonts.length,
      type3Fonts: rendered.type3Fonts.length,
      overflow: rendered.overflow.length,
    },
  };
}

/** Data URIs for the pinned images, used by the HTML-based PDF renderer. */
function dataUris(input: RenderInput): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [assetId, image] of input.images) {
    result[assetId] = `data:${image.mediaType};base64,${image.bytes.toString('base64')}`;
  }
  return result;
}

/** Renders a reflowable EPUB. */
function renderEpubFormat(input: RenderInput, options: ExportOptions & { format: 'epub' }): RenderResult {
  const result = renderEpub(input, options.options);
  return { buffer: result.buffer, contentType: EXPORT_CONTENT_TYPES.epub, extension: 'epub', facts: result.facts };
}

/** Renders an editable DOCX manuscript. */
function renderDocxFormat(input: RenderInput, options: ExportOptions & { format: 'docx' }): RenderResult {
  const result = renderDocx(input, options.options);
  return { buffer: result.buffer, contentType: EXPORT_CONTENT_TYPES.docx, extension: 'docx', facts: result.facts };
}

/** Renders one export. */
export async function renderExport(input: RenderInput, options: ExportOptions): Promise<RenderResult> {
  switch (options.format) {
    case 'pdf': return renderPdfFormat(input, options.options);
    case 'epub': return renderEpubFormat(input, options);
    case 'docx': return renderDocxFormat(input, options);
    default: throw new Error(`Unsupported export format "${String((options as { format: string }).format)}"`);
  }
}

/** The formats this server can render. */
export function renderableFormats(): ExportFormat[] { return ['pdf', 'epub', 'docx']; }
