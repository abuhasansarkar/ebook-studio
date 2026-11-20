import { z } from 'zod';

/**
 * S10 export contract shared by the API, the worker renderers and the export screen.
 *
 * An export is an immutable snapshot: the design, the manuscript chapters and the
 * pinned asset bytes are captured when the export is requested, so a later edit
 * can never change what a queued export renders or what a download serves.
 */

export const EXPORT_FORMATS = ['pdf', 'epub', 'docx'] as const;
export type ExportFormat = typeof EXPORT_FORMATS[number];
export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: 'PDF', epub: 'EPUB', docx: 'DOCX',
};
/** MIME types used for the stored object and the download response. */
export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: 'application/pdf', epub: 'application/epub+zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * PDF is a fixed-layout format: it carries the print profile (trim, margins, type size).
 * EPUB is a reflowable format: it carries the digital profile and never the print profile.
 * DOCX is an editable manuscript format: it carries the digital profile and a base type size.
 */
export const pdfOptionsSchema = z.object({
  layout: z.enum(['print', 'digital']).default('print'),
  /** Include the front and back matter from the saved design. */
  includeMatter: z.boolean().default(true),
  /** Include the table of contents as a navigable outline. */
  includeToc: z.boolean().default(true),
}).strict();
export const epubOptionsSchema = z.object({
  /** Include the front and back matter from the saved design. */
  includeMatter: z.boolean().default(true),
  /** Embed the cover image as the EPUB cover when the book has one. */
  includeCover: z.boolean().default(true),
  /** Reflowable text size as a percentage of the reading profile. */
  fontScale: z.number().min(0.85).max(1.4).default(1),
}).strict();
export const docxOptionsSchema = z.object({
  includeMatter: z.boolean().default(true),
  /** Base body type size in points. */
  fontSizePt: z.number().min(8).max(14).default(11),
  /** Repeat the first table row on each page of a long table. */
  repeatTableHeaders: z.boolean().default(true),
}).strict();

export const exportOptionsSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('pdf'), options: pdfOptionsSchema.default({ layout: 'print', includeMatter: true, includeToc: true }) }),
  z.object({ format: z.literal('epub'), options: epubOptionsSchema.default({ includeMatter: true, includeCover: true, fontScale: 1 }) }),
  z.object({ format: z.literal('docx'), options: docxOptionsSchema.default({ includeMatter: true, fontSizePt: 11, repeatTableHeaders: true }) }),
]);
export type ExportOptions = z.infer<typeof exportOptionsSchema>;
export type PdfExportOptions = z.infer<typeof pdfOptionsSchema>;
export type EpubExportOptions = z.infer<typeof epubOptionsSchema>;
export type DocxExportOptions = z.infer<typeof docxOptionsSchema>;

/** Options accepted by the request endpoint; `format` selects the options schema. */
export const exportRequestSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('pdf'), options: pdfOptionsSchema.partial().optional() }),
  z.object({ format: z.literal('epub'), options: epubOptionsSchema.partial().optional() }),
  z.object({ format: z.literal('docx'), options: docxOptionsSchema.partial().optional() }),
]);

export const EXPORT_STATUSES = ['queued', 'processing', 'ready', 'failed'] as const;
export type ExportStatus = typeof EXPORT_STATUSES[number];

/**
 * One recorded validation result. `error` blocks the download; `warning` is shown
 * to the reader but does not block it.
 */
export interface ExportValidationIssue {
  severity: 'error' | 'warning';
  /** Stable machine code, e.g. `epub.missing-nav`. */
  code: string;
  message: string;
}
export interface ExportValidation {
  /** True only when the file was written, re-opened from storage and checked. */
  passed: boolean;
  validator: string;
  issues: ExportValidationIssue[];
  /** Format-specific measurements (page count, entry count, part count…). */
  facts: Record<string, string | number | boolean>;
}

/**
 * The immutable inputs of one export. Stored with the export row so the worker
 * renders exactly what was requested, even after the manuscript or design changed.
 */
export interface ExportSnapshot {
  /** Schema version of this snapshot; older snapshots are upgraded on read. */
  schema: 1;
  format: ExportFormat;
  options: ExportOptions;
  book: { id: string; title: string; subtitle: string; author: string; language: string; dir: 'ltr' | 'rtl' };
  /** Design version and the full design snapshot captured at request time. */
  design: { version: number };
  /** Chapter versions rendered, in order. */
  chapters: { id: string; position: number; version: number; title: string }[];
  /** Design version of each chapter's content at request time. */
  contentHash: string;
  /** Pinned asset ids and the SHA-256 of each pinned object. */
  assets: { assetId: string; sha256: string; bytes: number }[];
  /** Cover asset id, when the book has a cover. */
  coverAssetId: string | null;
  requestedAt: string;
}

/** Formats this server can actually produce. */
export function supportedFormats(): ExportFormat[] { return [...EXPORT_FORMATS]; }
