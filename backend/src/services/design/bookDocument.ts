import { bookDesignSchema, documentError, fontStack, getLanguage, languageSupport, type BookDesign, type FontId } from '@ebook/shared';
import { prisma } from '../../database/prisma.js';
import { badRequest, conflict } from '../../utils/errors.js';
import { getBrief, getOwnedBook } from '../books/bookService.js';
import { fontRegistry, missingGlyphs, type GlyphFinding } from './fonts.js';

/**
 * Normalized book document: the single input to reader previews, print previews and PDF export.
 * It references manuscript versions and a design snapshot; it never mutates either.
 */
export interface BookDocument {
  book: { id: string; title: string; subtitle: string; author: string; language: string; dir: 'ltr' | 'rtl' };
  design: { version: number; data: BookDesign };
  chapters: { id: string; position: number; version: number; title: string; content: unknown }[];
  /** True when a preview deliberately rendered only the first chapters. */
  partial: boolean;
}
export interface DocumentDiagnostics { support: ReturnType<typeof languageSupport>; glyphs: GlyphFinding[]; emptyChapters: number }

export async function buildBookDocument(userId: string, bookId: string, design: { version: number; data: BookDesign }, options: { chapterLimit?: number; chapterIds?: string[] } = {}): Promise<BookDocument> {
  const book = await getOwnedBook(userId, bookId);
  const [brief, chapters] = await Promise.all([
    getBrief(bookId),
    prisma.chapter.findMany({ where: { bookId, OR: [{ wordCount: { gt: 0 } }, { status: 'done' }] }, orderBy: { position: 'asc' }, select: { id: true, position: true, version: true, title: true, contentJson: true } }),
  ]);
  for (const chapter of chapters) {
    const error = chapter.contentJson == null ? null : documentError(chapter.contentJson);
    if (error) throw badRequest(`Chapter "${chapter.title}" cannot be rendered: ${error}`);
  }
  const limit = options.chapterLimit ?? chapters.length;
  const language = getLanguage(book.language);
  // A named subset selects the chapters the caller asked for, in the book's own
  // order rather than the order they were named. A sample chapter pack is
  // assembled from the manuscript the author chose, not from a copy of it.
  const selected = options.chapterIds
    ? chapters.filter(c => options.chapterIds!.includes(c.id))
    : chapters;
  return {
    book: { id: book.id, title: book.title, subtitle: book.subtitle, author: brief.authorName ?? '', language: language.code, dir: language.dir },
    design: { version: design.version, data: bookDesignSchema.parse(design.data) },
    chapters: selected.slice(0, limit).map(c => ({ id: c.id, position: c.position, version: c.version, title: c.title, content: c.contentJson })),
    partial: selected.length > limit,
  };
}

/** Font stacks for each role, limited to installed fonts. */
export function documentStacks(doc: BookDocument, available: ReadonlySet<string>): Record<'body' | 'heading' | 'mono', FontId[]> {
  const t = doc.design.data.typography;
  const body = fontStack(doc.book.language, t.body, available);
  return { body, heading: fontStack(doc.book.language, t.headings, available), mono: available.has('notosansmono') ? ['notosansmono', ...body] : body };
}

/** Throws a clear error instead of letting Chromium substitute a system font for the whole book. */
export async function assertRenderable(doc: BookDocument) {
  const support = languageSupport(doc.book.language, await fontRegistry.available());
  if (support.level === 'unavailable') throw conflict(`${getLanguage(doc.book.language).name} cannot be typeset on this server: ${support.notes[0]} Ask the operator to install the approved fonts (pnpm --filter backend fonts:fetch).`, { code: 'FONT_UNAVAILABLE' });
  return support;
}

function collectText(node: unknown, role: 'body' | 'heading', out: { role: 'body' | 'heading'; text: string }[]) {
  const pending: { node: unknown; role: 'body' | 'heading' }[] = [{ node, role }];
  while (pending.length) {
    const { node: n, role: r } = pending.pop()!;
    if (!n || typeof n !== 'object') continue;
    const value = n as { type?: string; text?: string; content?: unknown[]; attrs?: { alt?: string; caption?: string } };
    if (value.type === 'text' && typeof value.text === 'string') out.push({ role: r, text: value.text });
    if (value.type === 'image') out.push({ role: 'body', text: `${value.attrs?.alt ?? ''}${value.attrs?.caption ?? ''}` });
    const childRole = value.type === 'heading' ? 'heading' : r;
    for (const child of value.content ?? []) pending.push({ node: child, role: childRole });
  }
}
export async function documentDiagnostics(doc: BookDocument): Promise<DocumentDiagnostics> {
  const available = await fontRegistry.available();
  const support = languageSupport(doc.book.language, available);
  const texts: { role: 'body' | 'heading'; text: string }[] = [
    { role: 'heading', text: `${doc.book.title}${doc.book.subtitle}${doc.book.author}` },
  ];
  const m = doc.design.data.matter;
  if (m.contents.enabled) texts.push({ role: 'heading', text: m.contents.title });
  for (const key of ['aboutAuthor', 'references'] as const) if (m[key].enabled) texts.push({ role: 'heading', text: m[key].title }, { role: 'body', text: m[key].text });
  for (const key of ['copyright', 'dedication'] as const) if (m[key].enabled) texts.push({ role: 'body', text: m[key].text });
  for (const chapter of doc.chapters) { texts.push({ role: 'heading', text: chapter.title }); collectText(chapter.content, 'body', texts); }
  const stacks = documentStacks(doc, available);
  const glyphs = support.level === 'unavailable' ? [] : await missingGlyphs(texts, stacks);
  return { support, glyphs, emptyChapters: doc.chapters.filter(c => !c.content).length };
}
