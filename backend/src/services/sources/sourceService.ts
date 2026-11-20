import { createHash, randomUUID } from 'node:crypto';
import {
  MAX_SOURCE_CHARACTERS,
  digestOfLocators,
  type ExtractedPassage,
  type ExtractionWarning,
  type SourceFormat,
} from '@ebook/shared';
import { prisma } from '../../database/prisma.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { storage } from '../storage/storage.js';
import { getOwnedBook } from '../books/bookService.js';
import {
  assertAcceptableSource,
  extractDocx,
  extractNotes,
  extractPdf,
  ExtractionError,
  sourceDigest,
  type ExtractionResult,
} from './extractors.js';
import { proposeChapters } from './retrieval.js';

/**
 * S11 research sources.
 *
 * A source is a private document. Uploading one stores the original file and an
 * immutable extraction of it. Nothing is written into the manuscript until the
 * author confirms a preview, and confirming twice does not duplicate content.
 */

const sourceSelect = {
  id: true, bookId: true, title: true, format: true, provenance: true, license: true,
  version: true, status: true, bytes: true, error: true, createdAt: true, updatedAt: true,
} as const;

/** A source row with the counts the list view shows. */
export type SourceRow = {
  id: string; bookId: string; title: string; format: string; provenance: string; license: string;
  version: number; status: string; bytes: number; error: string | null;
  createdAt: Date; updatedAt: Date; _count: { links: number };
};

/** One extracted passage as it is stored. */
export type StoredPassage = ExtractedPassage;

/**
 * The passages of the newest extraction of a source.
 *
 * An empty list when the source has no ready extraction, so a citation against
 * such a source is assessed as unverifiable rather than as missing.
 */
export async function passagesOfLatestVersion(sourceId: string): Promise<StoredPassage[]> {
  const version = await prisma.sourceVersion.findFirst({
    where: { sourceId, status: 'ready' },
    orderBy: { version: 'desc' },
    select: { passages: true },
  });
  if (!version) return [];
  return (version.passages as unknown as StoredPassage[]) ?? [];
}

async function getOwnedSource(userId: string, sourceId: string) {
  const source = await prisma.researchSource.findFirst({
    where: { id: sourceId, userId, deletedAt: null, book: { deletedAt: null } },
  });
  if (!source) throw notFound('Source');
  return source;
}

/** Parses the uploaded bytes for the declared format. */
async function extract(format: SourceFormat, buffer: Buffer): Promise<ExtractionResult> {
  try {
    if (format === 'notes') return extractNotes(buffer);
    if (format === 'docx') return extractDocx(buffer);
    return await extractPdf(buffer);
  } catch (err) {
    if (err instanceof ExtractionError) {
      return {
        status: 'failed',
        passages: [],
        warnings: [{ code: err.code, message: err.message }],
        characterCount: 0,
      };
    }
    throw err;
  }
}

/**
 * Groups passages into proposed chapters.
 *
 * A heading in the source starts a new group, so the proposed chapters follow
 * the document's own structure. A document without headings becomes one
 * proposal, which the author can still split.
 */
export { proposeChapters } from './retrieval.js';

export const sourceService = {
  /**
   * Uploads a source and extracts it.
   *
   * The original bytes are stored privately and the extraction is kept as an
   * immutable version, so a later upload creates a new version rather than
   * changing what an existing citation refers to.
   */
  async create(userId: string, bookId: string, input: { title: string; format: SourceFormat; provenance: string; license: string }, body: Buffer, mime: string) {
    await getOwnedBook(userId, bookId);
    assertAcceptableSource(body, mime, input.format);

    const sha256 = sourceDigest(body);
    const source = await prisma.researchSource.create({
      data: {
        userId, bookId, title: input.title, format: input.format,
        provenance: input.provenance, license: input.license,
        storageKey: `sources/${userId}/${bookId}/${randomUUID()}`,
        sha256, bytes: body.length, status: 'pending',
      },
    });
    // The row exists before the object write, so an interrupted upload stays discoverable.
    await storage.put(source.storageKey!, body, mime);

    const result = await extract(input.format, body);
    const version = await prisma.sourceVersion.create({
      data: {
        sourceId: source.id, version: 1, format: input.format, sha256, bytes: body.length,
        status: result.status, passageCount: result.passages.length, characterCount: result.characterCount,
        warnings: result.warnings as object, passages: result.passages as object,
      },
    });
    const updated = await prisma.researchSource.update({
      where: { id: source.id },
      data: {
        status: result.status, version: 1,
        // A failed or scanned document carries its reason, so the author is not
        // left looking at an empty source with no explanation.
        error: result.status === 'ready' ? null : result.warnings[0]?.message ?? 'The document could not be read.',
      },
      select: sourceSelect,
    });
    return { source: updated, version: { ...version, passages: result.passages } };
  },

  /** Every source of a book, newest first. A deleted source is not listed. */
  async list(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    const rows = await prisma.researchSource.findMany({
      where: { bookId, userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { ...sourceSelect, _count: { select: { links: true } } },
    });
    return rows;
  },

  /** One source with its current extraction. */
  async get(userId: string, sourceId: string) {
    const source = await getOwnedSource(userId, sourceId);
    const version = source.version
      ? await prisma.sourceVersion.findFirst({ where: { sourceId: source.id, version: source.version } })
      : null;
    return { source, version };
  },

  /** Every extraction of a source, newest first. */
  async versions(userId: string, sourceId: string) {
    const source = await getOwnedSource(userId, sourceId);
    return prisma.sourceVersion.findMany({
      where: { sourceId: source.id },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, format: true, sha256: true, bytes: true, status: true, passageCount: true, characterCount: true, warnings: true, appliedAt: true, createdAt: true },
    });
  },

  /** The passages of one version. */
  async passages(userId: string, sourceId: string, version?: number) {
    const source = await getOwnedSource(userId, sourceId);
    const row = version
      ? await prisma.sourceVersion.findFirst({ where: { sourceId: source.id, version } })
      : await prisma.sourceVersion.findFirst({ where: { sourceId: source.id }, orderBy: { version: 'desc' } });
    if (!row) throw notFound('Source version');
    return { version: row.version, passages: (row.passages as unknown as StoredPassage[]) ?? [], warnings: (row.warnings as unknown as ExtractionWarning[]) ?? [] };
  },

  /** The proposed chapter mapping for a version, for the preview step. */
  async preview(userId: string, sourceId: string, version?: number) {
    const source = await getOwnedSource(userId, sourceId);
    const row = version
      ? await prisma.sourceVersion.findFirst({ where: { sourceId: source.id, version } })
      : await prisma.sourceVersion.findFirst({ where: { sourceId: source.id }, orderBy: { version: 'desc' } });
    if (!row) throw notFound('Source version');
    const passages = (row.passages as unknown as StoredPassage[]) ?? [];
    return {
      version: row.version,
      status: row.status,
      // A version that was already applied cannot be applied again, and the
      // preview says so rather than offering a confirmation that would fail.
      appliedAt: row.appliedAt,
      warnings: (row.warnings as unknown as ExtractionWarning[]) ?? [],
      passages,
      proposals: proposeChapters(passages),
    };
  },

  /**
   * Applies a confirmed import.
   *
   * The import is idempotent: applying the same version twice does not create a
   * second copy of the chapters, because the version records that it was applied.
   */
  async apply(userId: string, sourceId: string, input: { version: number; chapters: { title: string; locators: string[] }[]; appendToChapterIds: string[] }) {
    const source = await getOwnedSource(userId, sourceId);
    const version = await prisma.sourceVersion.findFirst({ where: { sourceId: source.id, version: input.version } });
    if (!version) throw notFound('Source version');
    // Confirming the same version again is not an error: it changes nothing. The
    // answer says so plainly instead of reporting a failure the author cannot act on.
    if (version.appliedAt) return { created: [], appended: [], version: version.version, alreadyApplied: true };
    if (version.status !== 'ready') throw badRequest('This source version has no text to import.');

    const passages = (version.passages as unknown as StoredPassage[]) ?? [];
    const byLocator = new Map(passages.map((p) => [p.locator, p]));
    const unknown = input.chapters.flatMap((c) => c.locators).filter((l) => !byLocator.has(l));
    if (unknown.length) throw badRequest('The preview no longer matches this source version. Reload the preview and confirm again.');

    const { lockBook } = await import('../generation/jobRuntime.js');
    const { markdownToTiptap, countWords, tiptapToText } = await import('../editor/markdownToTiptap.js');
    const { Prisma } = await import('../../generated/prisma/client.js');

    return prisma.$transaction(async (tx) => {
      await lockBook(tx, source.bookId, userId);

      // The version is claimed inside the transaction, so a repeated confirmation
      // cannot create a second copy of the same content.
      const claimed = await tx.sourceVersion.updateMany({
        where: { id: version.id, appliedAt: null },
        data: { appliedAt: new Date() },
      });
      // Another confirmation claimed it first, so this one changed nothing.
      if (claimed.count === 0) return { created: [], appended: [], version: version.version, alreadyApplied: true };

      const existing = await tx.chapter.findMany({ where: { id: { in: input.appendToChapterIds }, bookId: source.bookId }, select: { id: true, position: true } });
      if (existing.length !== input.appendToChapterIds.length) throw badRequest('Some chapters you chose to append to no longer exist.');

      const lastPosition = await tx.chapter.findFirst({ where: { bookId: source.bookId }, orderBy: { position: 'desc' }, select: { position: true } });
      let position = lastPosition?.position ?? -1;

      const created: { id: string; title: string }[] = [];
      const appended: { id: string; title: string }[] = [];

      for (const proposal of input.chapters) {
        const body = proposal.locators
          .map((l) => byLocator.get(l)?.text ?? '')
          .filter(Boolean)
          .join('\n\n');
        if (!body.trim()) continue;
        const markdown = `# ${proposal.title}\n\n${body}`;
        const document = markdownToTiptap(markdown);
        const wordCount = countWords(tiptapToText(document));

        const appendTarget = input.appendToChapterIds[created.length + appended.length];
        if (appendTarget && existing.some((e) => e.id === appendTarget)) {
          const target = await tx.chapter.findUniqueOrThrow({ where: { id: appendTarget }, select: { id: true, title: true, contentJson: true, version: true, wordCount: true } });
          const existingDoc = (target.contentJson as unknown as { type?: string; content?: unknown[] } | null) ?? { type: 'doc', content: [] };
          const merged = {
            type: 'doc',
            content: [
              ...(existingDoc.content ?? []),
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: proposal.title }] },
              ...(document.content ?? []).filter((n) => !(n as { type?: string }).type?.startsWith('heading') || (n as { content?: { text?: string }[] }).content?.[0]?.text !== proposal.title),
            ],
          };
          const mergedWords = countWords(tiptapToText(merged as never));
          await tx.chapter.update({
            where: { id: target.id },
            data: { contentJson: merged as object, wordCount: mergedWords, version: { increment: 1 }, status: 'done' },
          });
          await tx.documentVersion.create({ data: {
            chapterId: target.id, version: target.version, title: target.title,
            contentJson: (target.contentJson ?? Prisma.DbNull) as object, wordCount: target.wordCount, savedAt: new Date(),
          } });
          appended.push({ id: target.id, title: target.title });
          continue;
        }

        position += 1;
        const chapter = await tx.chapter.create({
          data: {
            bookId: source.bookId, position, title: proposal.title, goal: 'Imported from a source document.',
            keyPoints: [], targetWords: wordCount, status: 'done', contentJson: document as object, wordCount,
          },
          select: { id: true, title: true },
        });
        created.push(chapter);
      }

      // The source is linked to the chapters it now supports.
      const linkedChapterIds = [...created.map((c) => c.id), ...appended.map((c) => c.id)];
      for (const chapterId of linkedChapterIds) {
        const locators = input.chapters.flatMap((c) => c.locators);
        await tx.chapterSourceLink.upsert({
          where: { sourceId_chapterId: { sourceId: source.id, chapterId } },
          create: {
            sourceId: source.id, bookId: source.bookId, chapterId,
            locators: locators as object,
            note: `Imported from ${source.title}.`,
            sourceVersion: version.version,
            passageDigest: digestOfLocators(passages, locators),
          },
          update: { locators: locators as object, sourceVersion: version.version, passageDigest: digestOfLocators(passages, locators) },
        });
      }

      return { created, appended, version: version.version, alreadyApplied: false };
    }, { timeout: 60000 });
  },

  /** Links a source to a chapter with the passages that support it. */
  async link(userId: string, sourceId: string, input: { chapterId: string; locators: string[]; note: string }) {
    const source = await getOwnedSource(userId, sourceId);
    const chapter = await prisma.chapter.findFirst({ where: { id: input.chapterId, bookId: source.bookId }, select: { id: true } });
    if (!chapter) throw notFound('Chapter');
    // The link records the version and the digest of the passages it cites, so
    // a later re-import or a revised text can be reported rather than silently
    // changing what the citation means.
    const passages = await passagesOfLatestVersion(source.id);
    return prisma.chapterSourceLink.upsert({
      where: { sourceId_chapterId: { sourceId: source.id, chapterId: input.chapterId } },
      create: {
        sourceId: source.id, bookId: source.bookId, chapterId: input.chapterId,
        locators: input.locators as object, note: input.note,
        sourceVersion: source.version,
        passageDigest: digestOfLocators(passages, input.locators),
      },
      update: {
        locators: input.locators as object, note: input.note,
        sourceVersion: source.version,
        passageDigest: digestOfLocators(passages, input.locators),
      },
    });
  },

  /** The sources linked to a chapter. */
  async linksForChapter(userId: string, chapterId: string) {
    const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, book: { userId, deletedAt: null } }, select: { id: true, bookId: true } });
    if (!chapter) throw notFound('Chapter');
    return prisma.chapterSourceLink.findMany({
      where: { chapterId },
      include: { source: { select: { id: true, title: true, format: true, version: true, status: true, deletedAt: true } } },
    });
  },

  /**
   * Removes a source.
   *
   * The stored file and the extraction go, but the source row and its links are
   * kept as a tombstone. A chapter that cited this source still cites it, and
   * the quality report can say that the text it rested on is gone. Deleting the
   * links instead would erase the very fact the report needs to report.
   */
  async remove(userId: string, sourceId: string) {
    const source = await getOwnedSource(userId, sourceId);
    await prisma.$transaction(async (tx) => {
      await tx.sourceVersion.deleteMany({ where: { sourceId: source.id } });
      await tx.researchSource.update({
        where: { id: source.id },
        data: { deletedAt: new Date(), status: 'failed', error: 'The source was deleted.', storageKey: null },
      });
    });
    if (source.storageKey) await storage.remove(source.storageKey).catch(() => undefined);
  },
};

/** Hashes the passages that support an answer, so a citation can be verified. */
export function passageDigest(text: string): string {
  return createHash('sha256').update(text.slice(0, MAX_SOURCE_CHARACTERS)).digest('hex');
}
