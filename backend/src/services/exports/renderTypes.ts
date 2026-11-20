import { getLanguage, languageScript, type BookDesign } from '@ebook/shared';
import type { PMNode } from '../editor/markdownToTiptap.js';

/**
 * S10 renderer registry inputs.
 *
 * Every renderer consumes the same normalized book document plus the pinned image
 * bytes captured when the export was requested. A renderer never reads the live
 * manuscript, so a queued export always produces the file that was requested.
 */

/** A pinned image: the asset id, its verified bytes and its media type. */
export interface PinnedImage {
  assetId: string;
  bytes: Buffer;
  mediaType: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
}
export type PinnedImages = Map<string, PinnedImage>;

/**
 * The parts of the normalized book document the renderers use.
 *
 * This is a structural subset of `BookDocument`, declared here so the renderer
 * types stay free of the database imports that `bookDocument.ts` pulls in.
 */
export interface RenderDocument {
  book: { id: string; title: string; subtitle: string; author: string; language: string; dir: 'ltr' | 'rtl' };
  design: { version: number; data: BookDesign };
  chapters: { id: string; position: number; version: number; title: string; content: unknown }[];
  /** True when a preview deliberately rendered only the first chapters. */
  partial: boolean;
}

export interface RenderInput {
  doc: RenderDocument;
  design: BookDesign;
  /** Pinned image bytes keyed by asset id. */
  images: PinnedImages;
  /** The cover image, when the book has one and the format wants it. */
  cover: PinnedImage | null;
  /** Available font face ids on this server. */
  availableFonts: ReadonlySet<string>;
  /** True when the manuscript language needs right-to-left layout. */
  rtl: boolean;
}

export interface RenderedFile {
  buffer: Buffer;
  /** Format-specific measurements recorded with the export. */
  facts: Record<string, string | number | boolean | string[]>;
}

/** Document language as BCP 47, with the script subtag so readers pick the right shaping. */
export function documentLanguage(doc: { book: { language: string } }): string {
  const language = getLanguage(doc.book.language);
  const script = languageScript(language.code);
  const subtag = script === 'latin' ? '' : `-${script}`;
  return `${language.code}${subtag}`;
}

/** Plain text of a TipTap node, used for metadata, navigation labels and EPUB text extraction. */
export function nodeText(node: PMNode | null | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return (node.text ?? '').normalize('NFC');
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'image') return `${node.attrs?.alt ?? ''} ${node.attrs?.caption ?? ''}`.trim();
  return (node.content ?? []).map(nodeText).join(node.type === 'paragraph' || node.type === 'heading' ? '\n' : '');
}
