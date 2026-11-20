import { z } from 'zod';

/**
 * S11 source and import contract shared by the API, the extractors and the research screen.
 *
 * A source is a private document the author imported. Extraction is a separate,
 * reviewable step: the imported text becomes proposed chapters that the author
 * must confirm before anything is written into the manuscript.
 */

/** Input formats this server can extract text from. */
export const SOURCE_FORMATS = ['notes', 'docx', 'pdf'] as const;
export type SourceFormat = typeof SOURCE_FORMATS[number];

export const SOURCE_FORMAT_LABELS: Record<SourceFormat, string> = {
  notes: 'Plain-text notes', docx: 'Word document (.docx)', pdf: 'Text PDF (.pdf)',
};

/** MIME types accepted for each format. */
export const SOURCE_CONTENT_TYPES: Record<SourceFormat, string[]> = {
  notes: ['text/plain', 'text/markdown'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  pdf: ['application/pdf'],
};

/** Uploaded originals are bounded before anything is parsed. */
export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
/** Extracted text is bounded so one document cannot flood the manuscript. */
export const MAX_SOURCE_CHARACTERS = 400_000;
/** A single extracted passage is bounded; very long paragraphs are split. */
export const MAX_PASSAGE_CHARACTERS = 4_000;
/** Bounded number of passages stored per source version. */
export const MAX_PASSAGES = 2_000;

/**
 * Extraction outcome.
 *
 * `scanned` means the document has no extractable text layer (a scan or an
 * image-only PDF). OCR is not implemented, so such a document is reported
 * rather than silently imported as an empty source.
 */
export const EXTRACTION_STATES = ['ready', 'empty', 'scanned', 'failed'] as const;
export type ExtractionState = typeof EXTRACTION_STATES[number];

export interface ExtractionWarning {
  /** Stable machine code, e.g. `pdf.no_text_layer`. */
  code: string;
  message: string;
}

export interface ExtractedPassage {
  /** Stable locator inside the source: `p12` for paragraph 12, `p12.3` for page 12. */
  locator: string;
  /** 1-based page number when the format has pages. */
  page: number | null;
  /** 1-based paragraph number inside the document. */
  paragraph: number;
  /** The extracted text of this passage. */
  text: string;
  /** True when the passage was truncated to the passage limit. */
  truncated: boolean;
  /**
   * The section heading this passage belongs to, when the document has one.
   *
   * The extractor records it rather than the proposal step guessing it, so a
   * proposed chapter follows the document's own structure.
   */
  heading?: string | null;
}

/**
 * One extracted source version.
 *
 * A version is immutable. Re-uploading the same source creates a new version so
 * citations can point at the exact text they were derived from.
 */
export interface SourceVersion {
  id: string;
  sourceId: string;
  version: number;
  /** notes | docx | pdf */
  format: SourceFormat;
  /** SHA-256 of the original uploaded bytes. */
  sha256: string;
  bytes: number;
  /** extraction | ready | empty | scanned | failed */
  status: ExtractionState;
  /** Number of passages extracted. */
  passageCount: number;
  /** Number of characters extracted. */
  characterCount: number;
  /** Warnings raised during extraction (truncated text, unsupported elements…). */
  warnings: ExtractionWarning[];
  /** Extracted passages in document order. */
  passages: ExtractedPassage[];
  createdAt: string;
}

/** A private source attached to a book. */
export interface ResearchSource {
  id: string;
  bookId: string;
  title: string;
  /** notes | docx | pdf */
  format: SourceFormat;
  /** The author's own note about where this came from. */
  provenance: string;
  /** The author's own note about permission or licensing. */
  license: string;
  /** Current version number; 0 when nothing has been extracted yet. */
  version: number;
  status: ExtractionState;
  passageCount: number;
  characterCount: number;
  /** True when the source has at least one chapter association. */
  linkedChapters: number;
  createdAt: string;
  updatedAt: string;
}

/** A chapter linked to a source, with the passages the author marked as supporting it. */
export interface ChapterSourceLink {
  id: string;
  sourceId: string;
  chapterId: string;
  /** Locators of the passages that support this chapter. */
  locators: string[];
  /** The author's note about how the source relates to the chapter. */
  note: string;
  createdAt: string;
}

/** One retrieved passage that supports an answer, with a stable link back to the source. */
export interface EvidencePassage {
  /** Passage locator, e.g. `p12`. */
  locator: string;
  /** Source id the passage came from. */
  sourceId: string;
  /** Source title, for display. */
  sourceTitle: string;
  /** 1-based page number when known. */
  page: number | null;
  /** The supporting text. */
  text: string;
}

/**
 * A source-grounded answer.
 *
 * `supported` is false when the sources do not contain enough to answer. The
 * answer then carries an explanation and no fabricated passages, rather than a
 * plausible but unsupported response.
 */
export interface SourceAnswer {
  /** supported | unsupported */
  outcome: 'supported' | 'unsupported';
  /** The answer text. Empty when the outcome is `unsupported`. */
  answer: string;
  /** Why the sources do not support an answer. Empty when `supported`. */
  reason: string;
  /** The passages that support the answer. Empty when `unsupported`. */
  evidence: EvidencePassage[];
  /** The sources that were consulted. */
  sourceIds: string[];
}

/** A summary of a source set, with the passages it was written from. */
export interface SourceSummary {
  /** summary | unsupported */
  outcome: 'summary' | 'unsupported';
  summary: string;
  reason: string;
  evidence: EvidencePassage[];
  sourceIds: string[];
}

/** Request body for creating a source from uploaded text. */
export const createSourceSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200),
  format: z.enum(SOURCE_FORMATS),
  provenance: z.string().trim().max(500).default(''),
  license: z.string().trim().max(500).default(''),
}).strict();
export type CreateSourceInput = z.infer<typeof createSourceSchema>;

/** Request body for confirming a proposed import into the manuscript. */
export const applyImportSchema = z.object({
  /** The extraction version being applied. */
  version: z.number().int().positive(),
  /** Proposed chapter title to body mapping, in order. */
  chapters: z.array(z.object({
    title: z.string().trim().min(1).max(300),
    /** Locators of the passages that make up this chapter. */
    locators: z.array(z.string().regex(/^p[\d.]+$/)).min(1).max(500),
  }).strict()).min(1).max(200),
  /** Existing chapters the imported content should be appended to, by chapter id. */
  appendToChapterIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)).max(200).default([]),
}).strict();
export type ApplyImportInput = z.infer<typeof applyImportSchema>;

/** Request body for linking a source to a chapter. */
export const linkSourceSchema = z.object({
  chapterId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  locators: z.array(z.string().regex(/^p[\d.]+$/)).max(500).default([]),
  note: z.string().trim().max(1000).default(''),
}).strict();
export type LinkSourceInput = z.infer<typeof linkSourceSchema>;

/** Request body for a source-grounded question. */
export const sourceQuestionSchema = z.object({
  question: z.string().trim().min(3, 'Ask a question').max(1000),
  sourceIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)).max(50).default([]),
}).strict();
export type SourceQuestionInput = z.infer<typeof sourceQuestionSchema>;

/**
 * Splits extracted text into passages.
 *
 * Paragraph boundaries are stable across formats so a locator stays meaningful
 * when the same document is re-extracted. Very long paragraphs are split at a
 * sentence boundary when one is close enough, so a passage is never cut mid-word
 * without saying so.
 */
export function splitPassages(text: string, options: { startParagraph?: number; pages?: { page: number; text: string }[] } = {}): ExtractedPassage[] {
  const passages: ExtractedPassage[] = [];
  let paragraph = options.startParagraph ?? 1;
  const push = (body: string, page: number | null) => {
    const trimmed = body.replace(/[ \t\u00a0]+/g, ' ').trim();
    if (!trimmed) return;
    if (trimmed.length <= MAX_PASSAGE_CHARACTERS) {
      passages.push({ locator: `p${paragraph}`, page, paragraph, text: trimmed, truncated: false });
      paragraph++;
      return;
    }
    // Split a long paragraph at sentence boundaries, keeping each piece bounded.
    const sentences = trimmed.match(/[^.!?।؟]+[.!?।؟]+[\s"'”’)]*|[^.!?।؟]+$/g) ?? [trimmed];
    let buffer = '';
    for (const sentence of sentences) {
      if (buffer && buffer.length + sentence.length > MAX_PASSAGE_CHARACTERS) {
        passages.push({ locator: `p${paragraph}`, page, paragraph, text: buffer.trim(), truncated: true });
        paragraph++;
        buffer = '';
      }
      // A single sentence can still exceed the limit; it is cut at a word boundary.
      if (sentence.length > MAX_PASSAGE_CHARACTERS) {
        if (buffer.trim()) {
          passages.push({ locator: `p${paragraph}`, page, paragraph, text: buffer.trim(), truncated: true });
          paragraph++;
          buffer = '';
        }
        const words = sentence.split(' ');
        let piece = '';
        for (const word of words) {
          if (piece && piece.length + word.length + 1 > MAX_PASSAGE_CHARACTERS) {
            passages.push({ locator: `p${paragraph}`, page, paragraph, text: piece.trim(), truncated: true });
            paragraph++;
            piece = '';
          }
          piece += piece ? ` ${word}` : word;
        }
        buffer = piece;
        continue;
      }
      buffer += sentence;
    }
    if (buffer.trim()) {
      passages.push({ locator: `p${paragraph}`, page, paragraph, text: buffer.trim(), truncated: buffer.length >= MAX_PASSAGE_CHARACTERS });
      paragraph++;
    }
  };

  if (options.pages?.length) {
    for (const { page, text: pageText } of options.pages) {
      for (const block of pageText.split(/\n\s*\n/)) push(block, page);
    }
  } else {
    for (const block of text.split(/\n\s*\n/)) push(block, null);
  }
  return passages;
}

/** The locator of a passage, used when a citation must point at one. */
export function passageLocator(passage: { locator: string }): string {
  return passage.locator;
}

/** True when a locator is well formed. */
export function isLocator(value: string): boolean {
  return /^p[\d.]+$/.test(value);
}
