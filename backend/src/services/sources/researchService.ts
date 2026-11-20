import { prisma } from '../../database/prisma.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { getOwnedBook } from '../books/bookService.js';
import { finalizeAnswer, finalizeSummary, retrievePassages } from './retrieval.js';
import { sourceAnswerer } from '../ai/sourceAnswerer.js';
import type { StoredPassage } from './sourceService.js';

/**
 * S11 research workspace.
 *
 * A question is answered from the passages of the author's own imported
 * sources. Every answer that is shown carries the passages it came from, and a
 * question the sources do not support is answered with an explicit abstention.
 */

/** The passages of the given sources, newest extraction first. */
async function loadPassages(userId: string, bookId: string, sourceIds: string[]) {
  const sources = await prisma.researchSource.findMany({
    where: { bookId, userId, ...(sourceIds.length ? { id: { in: sourceIds } } : {}) },
    select: { id: true, title: true, status: true, version: true },
  });
  if (!sources.length) return [];

  const versions = await prisma.sourceVersion.findMany({
    where: { sourceId: { in: sources.map((s) => s.id) }, status: 'ready' },
    orderBy: { version: 'desc' },
    select: { sourceId: true, version: true, passages: true },
  });
  // The newest ready version of each source is used.
  const newest = new Map<string, (typeof versions)[number]>();
  for (const version of versions) if (!newest.has(version.sourceId)) newest.set(version.sourceId, version);

  const out: { locator: string; sourceId: string; sourceTitle: string; page: number | null; text: string }[] = [];
  for (const source of sources) {
    const version = newest.get(source.id);
    if (!version) continue;
    for (const passage of (version.passages as unknown as StoredPassage[]) ?? []) {
      out.push({ locator: passage.locator, sourceId: source.id, sourceTitle: source.title, page: passage.page, text: passage.text });
    }
  }
  return out;
}

export const researchService = {
  /**
   * Answers a question from the book's sources.
   *
   * When no source is chosen, every ready source of the book is consulted.
   */
  async answer(userId: string, bookId: string, input: { question: string; sourceIds: string[] }) {
    const book = await getOwnedBook(userId, bookId);
    const passages = await loadPassages(userId, bookId, input.sourceIds);
    const { passages: retrieved } = retrievePassages(input.question, passages);
    const { draft } = await sourceAnswerer.answer({ language: book.language, question: input.question, passages: retrieved });
    return finalizeAnswer(draft, retrieved);
  },

  /** Summarizes the book's sources, or a chosen subset. */
  async summarize(userId: string, bookId: string, input: { sourceIds: string[] }) {
    const book = await getOwnedBook(userId, bookId);
    const passages = await loadPassages(userId, bookId, input.sourceIds);
    // A summary covers the sources themselves, so the passages are used in order
    // rather than ranked against a question.
    const retrieved = passages.slice(0, 40).map((p, index) => ({ index, ...p }));
    const { draft } = await sourceAnswerer.summarize({ language: book.language, passages: retrieved });
    return finalizeSummary(draft, retrieved);
  },

  /** The passages cited by an answer, so a click opens the real text. */
  async passage(userId: string, sourceId: string, locator: string) {
    const source = await prisma.researchSource.findFirst({ where: { id: sourceId, userId, book: { deletedAt: null } }, select: { id: true, title: true, version: true, bookId: true } });
    if (!source) throw notFound('Source');
    const version = await prisma.sourceVersion.findFirst({ where: { sourceId: source.id }, orderBy: { version: 'desc' }, select: { passages: true, version: true } });
    if (!version) throw notFound('Source version');
    const passages = (version.passages as unknown as StoredPassage[]) ?? [];
    const passage = passages.find((p) => p.locator === locator);
    if (!passage) throw notFound('Passage');
    return { source: { id: source.id, title: source.title }, version: version.version, passage };
  },

  /**
   * The citations of a chapter, with a warning when the source changed.
   *
   * A link whose source was replaced points at a version that no longer exists,
   * so the citation is reported as stale rather than shown as if it still held.
   */
  async chapterCitations(userId: string, chapterId: string) {
    const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, book: { userId, deletedAt: null } }, select: { id: true, bookId: true, title: true } });
    if (!chapter) throw notFound('Chapter');
    const links = await prisma.chapterSourceLink.findMany({
      where: { chapterId },
      include: { source: { select: { id: true, title: true, version: true, status: true, updatedAt: true } } },
    });
    const citations = links.map((link) => {
      const locators = (link.locators as unknown as string[]) ?? [];
      return {
        id: link.id,
        sourceId: link.sourceId,
        sourceTitle: link.source.title,
        note: link.note,
        locators,
        /** True when the source was re-uploaded after the link was made. */
        stale: link.source.status !== 'ready',
        updatedAt: link.source.updatedAt,
      };
    });
    return { chapter: { id: chapter.id, title: chapter.title }, citations };
  },

  /** The links of a source, for the source detail screen. */
  async sourceLinks(userId: string, sourceId: string) {
    const source = await prisma.researchSource.findFirst({ where: { id: sourceId, userId, book: { deletedAt: null } }, select: { id: true } });
    if (!source) throw notFound('Source');
    const links = await prisma.chapterSourceLink.findMany({
      where: { sourceId },
      include: { chapter: { select: { id: true, title: true, position: true } } },
    });
    return links.map((link) => ({
      id: link.id,
      chapter: link.chapter,
      locators: (link.locators as unknown as string[]) ?? [],
      note: link.note,
    }));
  },

  /** Validates that the chosen sources belong to this book. */
  async assertSources(userId: string, bookId: string, sourceIds: string[]) {
    if (!sourceIds.length) return;
    const count = await prisma.researchSource.count({ where: { id: { in: sourceIds }, bookId, userId } });
    if (count !== sourceIds.length) throw badRequest('Some of the sources you chose do not belong to this book.');
  },
};
