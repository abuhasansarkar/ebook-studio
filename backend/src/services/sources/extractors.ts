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

/** Reads one XML part of a DOCX and returns its text content. */
function xmlText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
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
    entries = readZip(buffer, { only: (name) => name === 'word/document.xml', maxEntryBytes: 64 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024 });
  } catch (err) {
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
  const paragraphs: string[] = [];
  for (const match of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const text = xmlText(match[1]).trim();
    if (text) paragraphs.push(text);
  }
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
 * Text extraction is delegated to the renderer that already turns pages into
 * images, because that is the only text extractor this server has. A PDF whose
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
 * Pulls the text layer out of a PDF.
 *
 * Chromium renders the PDF and reads the resulting text. A PDF that Chromium
 * cannot open is an extraction failure, not an empty source.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const { extractPdfPageText } = await import('../exports/pdfRenderer.js');
  return extractPdfPageText(buffer);
}

/** SHA-256 of the uploaded bytes; the version records the exact file it came from. */
export function sourceDigest(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
