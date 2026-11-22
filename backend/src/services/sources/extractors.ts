import { createHash } from 'node:crypto';
import {
  MAX_PASSAGES,
  MAX_SOURCE_BYTES,
  MAX_SOURCE_CHARACTERS,
  SOURCE_CONTENT_TYPES,
  splitPassages,
  type ExtractedPassage,
  type ExtractionWarning,
  type SourceFormat,
} from '@ebook/shared';
import { badRequest } from '../../utils/errors.js';
import { readZip, zipEntry, ZipError } from '../exports/zip.js';

/**
 * S11 document extraction.
 *
 * Extraction is deliberately narrow: it reads text out of a private document and
 * nothing else. It never runs macros, never resolves external references, never
 * fetches anything and never follows a link in the document. A document is data,
 * not instructions.
 */

/** Result of extracting one document. */
export interface ExtractionResult {
  status: 'ready' | 'empty' | 'scanned' | 'failed';
  passages: ExtractedPassage[];
  warnings: ExtractionWarning[];
  characterCount: number;
}

/** Raised for a document that cannot be parsed at all. */
export class ExtractionError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/** True when the bytes start with a ZIP local-file header. */
function looksLikeZip(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50;
}

/** True when the bytes start with the PDF header. */
function looksLikePdf(buffer: Buffer): boolean {
  return buffer.length > 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

/**
 * Rejects a document before it is parsed.
 *
 * The declared MIME type is checked against the actual bytes, so a renamed
 * executable cannot reach the parsers.
 */
export function assertAcceptableSource(buffer: Buffer, declaredMime: string, format: SourceFormat): void {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw badRequest('The uploaded file is empty.');
  if (buffer.length > MAX_SOURCE_BYTES) {
    throw badRequest(`The file is larger than ${Math.round(MAX_SOURCE_BYTES / (1024 * 1024))} MiB. Split it into smaller documents.`);
  }
  const accepted = SOURCE_CONTENT_TYPES[format];
  if (!accepted.includes(declaredMime)) {
    throw badRequest(`Upload a ${format === 'notes' ? 'plain-text or Markdown file' : format === 'docx' ? 'Word document (.docx)' : 'PDF document (.pdf)'}.`);
  }
  // A file whose bytes contradict its declared type is refused outright: it is a
  // hostile upload, not a damaged document, so nothing is stored.
  if (format === 'docx' && !looksLikeZip(buffer)) throw badRequest('This file is not a Word document.');
  if (format === 'pdf' && !looksLikePdf(buffer)) throw badRequest('This file is not a PDF document.');
  if (format === 'notes') {
    // A binary file renamed to .txt is rejected: control bytes other than tab and
    // newline mean the content is not text.
    let control = 0;
    const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
    for (const byte of sample) if (byte < 9 || (byte > 13 && byte < 32)) control++;
    if (sample.length && control / sample.length > 0.02) throw badRequest('This file is not plain text.');
  }
}

/** Bounds the extracted text and passages, and records what was left out. */
function bound(passages: ExtractedPassage[], warnings: ExtractionWarning[]): ExtractionResult {
  let characters = 0;
  const kept: ExtractedPassage[] = [];
  let truncatedByLimit = false;
  for (const passage of passages) {
    if (kept.length >= MAX_PASSAGES) { truncatedByLimit = true; break; }
    if (characters + passage.text.length > MAX_SOURCE_CHARACTERS) { truncatedByLimit = true; break; }
    kept.push(passage);
    characters += passage.text.length;
  }
  if (truncatedByLimit) {
    warnings.push({
      code: 'source.truncated',
      message: `Only the first ${kept.length} passages were imported. The document was longer than this server imports in one go.`,
    });
  }
  return {
    status: kept.length ? 'ready' : 'empty',
    passages: kept,
    warnings,
    characterCount: characters,
  };
}

// ---------------------------------------------------------------------------
// Plain-text and Markdown notes
// ---------------------------------------------------------------------------

/**
 * Extracts plain-text or Markdown notes.
 *
 * Markdown headings become passage markers so a proposed chapter can follow the
 * document's own structure. No HTML is ever produced: the text stays text.
 */
export function extractNotes(buffer: Buffer): ExtractionResult {
  const text = buffer.toString('utf8');
  if (text.includes('\u0000')) {
    return { status: 'failed', passages: [], warnings: [{ code: 'notes.binary', message: 'This file contains binary data.' }], characterCount: 0 };
  }
  const warnings: ExtractionWarning[] = [];
  // Each block keeps the heading it belongs to, so the heading text travels with
  // its body into the extracted passages.
  const blocks: { text: string; heading?: string }[] = [];
  let currentHeading: string | undefined;
  let bufferLines: string[] = [];

  const flush = () => {
    const body = bufferLines.join('\n').trim();
    if (body) blocks.push({ text: body, heading: currentHeading });
    bufferLines = [];
  };

  for (const line of text.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      currentHeading = heading[2].trim();
      continue;
    }
    // A setext heading (text underlined by === or ---) is also a heading.
    if (/^(={3,}|-{3,})$/.test(line) && bufferLines.length) {
      const title = bufferLines.join('\n').trim();
      bufferLines = [];
      if (title) {
        flush();
        currentHeading = title;
      }
      continue;
    }
    bufferLines.push(line);
  }
  flush();

  if (!blocks.length) {
    return { status: 'empty', passages: [], warnings: [{ code: 'notes.empty', message: 'The file has no readable text.' }], characterCount: 0 };
  }

  // Each heading starts a new group; the heading text is kept with its body and
  // recorded on the passage, so the proposal step can follow the document's own
  // structure instead of guessing where a heading was. The paragraph counter
  // runs across the whole document, so a locator stays unique even when the
  // document has many headings.
  const passages: ExtractedPassage[] = [];
  let paragraph = 1;
  for (const block of blocks) {
    const body = block.heading ? `${block.heading}\n${block.text}` : block.text;
    for (const passage of splitPassages(body, { startParagraph: paragraph })) {
      passages.push({ ...passage, heading: block.heading ?? null });
      paragraph = passage.paragraph + 1;
    }
  }
  if (!passages.length) {
    return { status: 'empty', passages: [], warnings: [{ code: 'notes.empty', message: 'The file has no readable text.' }], characterCount: 0 };
  }
  return bound(passages, warnings);
}

// ---------------------------------------------------------------------------
// Word documents
// ---------------------------------------------------------------------------

/** Largest inflated `word/document.xml` accepted; a real manuscript is far smaller. */
export const MAX_DOCX_XML_BYTES = 8 * 1024 * 1024;

/** Decodes the XML entities that can appear in DOCX text. */
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d{1,7});/g, (raw, code: string) => safeCodePoint(Number(code), raw))
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (raw, code: string) => safeCodePoint(parseInt(code, 16), raw))
    .replace(/&amp;/g, '&');
}

function safeCodePoint(code: number, raw: string): string {
  return code <= 0x10ffff ? String.fromCodePoint(code) : raw;
}

/**
 * The text of every `<w:p>` paragraph, in document order.
 *
 * A single forward scan: each `indexOf` starts where the previous one ended, so
 * the cost is linear in the size of the XML even when a tag is never closed.
 * (A backtracking regex over unclosed paragraphs was quadratic.) Text between
 * tags inside a paragraph is kept, `<w:tab/>` becomes a tab and `<w:br/>` a
 * line break. A paragraph nested in a text box ends before its parent does.
 * A paragraph that is never closed is dropped.
 */
export function docxParagraphs(xml: string): string[] {
  const paragraphs: string[] = [];
  const open: string[][] = [];
  let cursor = 0;
  while (cursor < xml.length) {
    const lt = xml.indexOf('<', cursor);
    const textEnd = lt < 0 ? xml.length : lt;
    if (open.length && textEnd > cursor) open[open.length - 1].push(xml.slice(cursor, textEnd));
    if (lt < 0) break;
    const gt = xml.indexOf('>', lt + 1);
    if (gt < 0) break;
    const tag = xml.slice(lt + 1, gt);
    cursor = gt + 1;
    const closing = tag.startsWith('/');
    const body = closing ? tag.slice(1) : tag;
    const nameEnd = body.search(/[\s/]/);
    const name = nameEnd < 0 ? body : body.slice(0, nameEnd);
    const selfClosing = tag.endsWith('/');
    if (name === 'w:p') {
      if (closing) {
        const parts = open.pop();
        if (parts) {
          const text = decodeEntities(parts.join('')).trim();
          if (text) paragraphs.push(text);
        }
      } else if (!selfClosing) {
        open.push([]);
      }
    } else if (open.length && !closing) {
      if (name === 'w:tab') open[open.length - 1].push('\t');
      else if (name === 'w:br' || name === 'w:cr') open[open.length - 1].push('\n');
    }
  }
  return paragraphs;
}

/**
 * Extracts a Word document.
 *
 * Only `word/document.xml` is read. Headers, footers, footnotes, embedded
 * objects and macros are ignored rather than executed. A document that is not a
 * Word package, or whose main part is missing, is rejected.
 */
export function extractDocx(buffer: Buffer): ExtractionResult {
  const warnings: ExtractionWarning[] = [];
  let entries;
  try {
    // Only the main part is read, so nothing else in the package is inflated.
    entries = readZip(buffer, { only: (name) => name === 'word/document.xml', maxEntryBytes: MAX_DOCX_XML_BYTES, maxTotalBytes: MAX_DOCX_XML_BYTES });
  } catch (err) {
    if (err instanceof ZipError && /too large/.test(err.message)) {
      return { status: 'failed', passages: [], warnings: [{ code: 'docx.too_large', message: `The text of this Word document is larger than ${MAX_DOCX_XML_BYTES / (1024 * 1024)} MiB once unpacked. Split it into smaller documents.` }], characterCount: 0 };
    }
    const message = err instanceof ZipError
      ? 'The Word document could not be opened: it is damaged or not a real .docx file.'
      : 'The Word document could not be opened.';
    return { status: 'failed', passages: [], warnings: [{ code: 'docx.corrupt', message }], characterCount: 0 };
  }
  const main = zipEntry(entries, 'word/document.xml');
  if (!main) {
    return { status: 'failed', passages: [], warnings: [{ code: 'docx.no_document', message: 'This Word document has no main text part.' }], characterCount: 0 };
  }

  const xml = main.data.toString('utf8');
  // Paragraphs are the unit of text. Table cells are paragraphs too.
  const paragraphs = docxParagraphs(xml);
  if (!paragraphs.length) {
    return { status: 'empty', passages: [], warnings: [{ code: 'docx.empty', message: 'The Word document has no text.' }], characterCount: 0 };
  }
  // The table of contents field holds a placeholder rather than real content.
  if (paragraphs.some(p => /right-click and choose "update field"/i.test(p))) {
    warnings.push({ code: 'docx.toc_placeholder', message: 'The document contained a table-of-contents placeholder. Only the surrounding text was imported.' });
  }
  const passages: ExtractedPassage[] = [];
  let paragraph = 1;
  for (const block of paragraphs.join('\n\n').split(/\n\s*\n/)) {
    for (const passage of splitPassages(block, { startParagraph: paragraph })) {
      passages.push(passage);
      paragraph = passage.paragraph + 1;
    }
  }
  return bound(passages, warnings);
}

// ---------------------------------------------------------------------------
// PDF documents
// ---------------------------------------------------------------------------

/** True when the PDF declares an image-only page rather than text. */
function hasTextLayer(pdfText: string): boolean {
  return pdfText.trim().length > 0;
}

/**
 * Extracts a PDF with a text layer.
 *
 * The text layer is read with pdf.js, bounded in time and size. A PDF whose
 * pages have no text layer is reported as `scanned`: OCR is not implemented, so
 * the document is described rather than silently imported as an empty source.
 */
export async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const warnings: ExtractionWarning[] = [];
  const text = await extractPdfText(buffer);
  if (!hasTextLayer(text)) {
    return {
      status: 'scanned',
      passages: [],
      warnings: [{
        code: 'pdf.no_text_layer',
        message: 'This PDF has no selectable text. It looks like a scan, and this server cannot read scanned pages yet. Paste the text as notes to import it.',
      }],
      characterCount: 0,
    };
  }
  const passages: ExtractedPassage[] = [];
  let paragraph = 1;
  for (const block of text.split(/\n\s*\n/)) {
    for (const passage of splitPassages(block, { startParagraph: paragraph })) {
      passages.push(passage);
      paragraph = passage.paragraph + 1;
    }
  }
  if (!passages.length) {
    return { status: 'empty', passages: [], warnings: [{ code: 'pdf.empty', message: 'The PDF has no readable text.' }], characterCount: 0 };
  }
  return bound(passages, warnings);
}

/**
 * Pulls the text layer out of a PDF with pdf.js (see `pdfText.ts`). A PDF the
 * parser cannot open is an extraction failure, not an empty source.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const { extractPdfPageText } = await import('./pdfText.js');
  return extractPdfPageText(buffer);
}

/** SHA-256 of the uploaded bytes; the version records the exact file it came from. */
export function sourceDigest(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
