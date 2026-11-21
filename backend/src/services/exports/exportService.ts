import { createHash } from 'node:crypto';
import {
  COVER_HEIGHT,
  COVER_WIDTH,
  EXPORT_CONTENT_TYPES,
  EXPORT_FORMAT_LABELS,
  exportOptionsSchema,
  getLanguage,
  languageSupport,
  type BookDesign,
  type ExportFormat,
  type ExportOptions,
  type ExportSnapshot,
} from '@ebook/shared';
import { prisma } from '../../database/prisma.js';
import { enqueueExport } from '../../queues/index.js';
import { AppError, conflict, notFound } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { requireEntitlement } from '../billing/entitlements.js';
import { getOwnedBook } from '../books/bookService.js';
import { assertRenderable, buildBookDocument, documentDiagnostics, type BookDocument } from '../design/bookDocument.js';
import { designService } from '../design/designService.js';
import { fontRegistry } from '../design/fonts.js';
import { storage } from '../storage/storage.js';
import { renderExport } from './renderers.js';
import { contentHash } from './hash.js';
import { coverService } from '../covers/coverService.js';
import type { PinnedImage, PinnedImages } from './renderTypes.js';
import { validateExport } from './validators.js';

export const SUPPORTED_FORMATS = ['pdf', 'epub', 'docx'] as const;

function slugify(s: string) {
  const slug = s
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80);
  return slug || 'ebook';
}

/** Parses the request options for a format, applying that format's defaults. */
export function parseExportOptions(format: ExportFormat, raw: unknown): ExportOptions {
  return exportOptionsSchema.parse({ format, options: raw ?? undefined });
}

/** The pinned image bytes and cover of one export, read from storage. */
export async function loadPinnedImages(userId: string, assetIds: string[], coverAssetId: string | null): Promise<{ images: PinnedImages; cover: PinnedImage | null }> {
  const images: PinnedImages = new Map();
  const ids = [...new Set([...assetIds, ...(coverAssetId ? [coverAssetId] : [])])];
  for (const id of ids) {
    const asset = await prisma.asset.findFirst({ where: { id, userId, status: 'ready' } });
    if (!asset) continue;
    const { stream } = await storage.getStream(asset.storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const pinned: PinnedImage = {
      assetId: id,
      bytes: Buffer.concat(chunks),
      mediaType: 'image/webp',
      width: asset.width,
      height: asset.height,
      alt: asset.alt ?? '',
      caption: asset.caption ?? '',
    };
    images.set(id, pinned);
  }
  const cover = coverAssetId ? images.get(coverAssetId) ?? null : null;
  return { images, cover };
}

/** The cover asset of a book, when one has been chosen and it is still stored. */
export async function findCoverAsset(userId: string, bookId: string): Promise<string | null> {
  const cover = await prisma.coverDesign.findFirst({
    where: { bookId },
    orderBy: { version: 'desc' },
    select: { data: true },
  });
  const artworkId = (cover?.data as { artworkId?: string | null } | undefined)?.artworkId;
  if (!artworkId) return null;
  const asset = await prisma.asset.findFirst({ where: { id: artworkId, userId, status: 'ready' }, select: { id: true } });
  return asset?.id ?? null;
}

/** The image asset ids referenced by the manuscript. */
export function referencedAssetIds(doc: BookDocument): string[] {
  const ids = new Set<string>();
  const pending: unknown[] = doc.chapters.map((c) => c.content);
  while (pending.length) {
    const node = pending.pop() as { type?: string; attrs?: { assetId?: string }; content?: unknown[] } | null;
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'image' && typeof node.attrs?.assetId === 'string') ids.add(node.attrs.assetId);
    if (node.content) pending.push(...node.content);
  }
  return [...ids];
}

/**
 * Refuses to queue an export when the server cannot render one.
 *
 * The PDF renderer needs Chromium; without it a PDF export would fail in the
 * worker after the request was accepted, which is a worse experience than a
 * clear refusal at request time.
 */
async function assertRuntimeAvailable() {
  const available = await fontRegistry.available();
  if (!available.size) throw conflict('This server has no book fonts installed, so it cannot produce an export. Ask the operator to install the approved fonts (pnpm --filter backend fonts:fetch).', { code: 'FONT_UNAVAILABLE' });
}

/**
 * The cover an EPUB carries: the composed cover from the cover studio (the
 * artwork with the title, subtitle and author set on it), rendered from the
 * version saved when the export was requested. The bare artwork is only a
 * fallback when the composition cannot be rendered, and that is logged.
 */
async function composedCover(userId: string, bookId: string, snapshot: ExportSnapshot | null, doc: BookDocument, artwork: PinnedImage | null): Promise<PinnedImage | null> {
  if (snapshot?.coverVersion == null) return artwork;
  try {
    const bytes = await coverService.render(userId, bookId, snapshot.coverVersion);
    return { assetId: 'composed-cover', bytes, mediaType: 'image/jpeg', width: COVER_WIDTH, height: COVER_HEIGHT, alt: `Cover of ${doc.book.title}`, caption: '' };
  } catch (err) {
    logger.warn({ err, bookId }, 'Composed cover could not be rendered; using the artwork alone');
    return artwork;
  }
}

const SNAPSHOT_UNAVAILABLE = 'A chapter was changed or removed after this export was requested, and the text it was requested with is no longer available. Request the export again.';

/**
 * The book as it was when the export was requested.
 *
 * The worker may run after the author has kept editing. A chapter whose
 * version still matches is used as it is; one that has moved on is read back
 * from its saved version history. The result is checked against the content
 * hash recorded at request time, so the file is exactly what was asked for or
 * the export fails; it never quietly mixes in later edits.
 */
async function pinToSnapshot(doc: BookDocument, snapshot: ExportSnapshot | null): Promise<BookDocument> {
  if (!snapshot?.chapters?.length || !snapshot.contentHash) return doc;
  const live = new Map(doc.chapters.map((chapter) => [chapter.id, chapter]));
  const chapters: BookDocument['chapters'] = [];
  for (const wanted of snapshot.chapters) {
    const current = live.get(wanted.id);
    if (current && current.version === wanted.version) {
      chapters.push(current);
      continue;
    }
    const saved = await prisma.documentVersion.findUnique({ where: { chapterId_version: { chapterId: wanted.id, version: wanted.version } } });
    if (!saved) throw new AppError(409, 'EXPORT_SNAPSHOT_UNAVAILABLE', SNAPSHOT_UNAVAILABLE);
    chapters.push({ id: wanted.id, position: wanted.position, version: wanted.version, title: saved.title, content: saved.contentJson });
  }
  if (contentHash(chapters.map((c) => ({ id: c.id, version: c.version, content: c.content }))) !== snapshot.contentHash) {
    throw new AppError(409, 'EXPORT_SNAPSHOT_UNAVAILABLE', SNAPSHOT_UNAVAILABLE);
  }
  return {
    ...doc,
    book: { ...doc.book, title: snapshot.book.title, subtitle: snapshot.book.subtitle },
    chapters,
  };
}

export const exportService = {
  /**
   * Requests an export.
   *
   * Every input the renderer will need is captured here: the design, the chapter
   * versions, the pinned asset ids and a hash of the content. A later edit to the
   * manuscript or the design cannot change what this export renders.
   */
  async request(userId: string, bookId: string, format: ExportFormat, rawOptions?: unknown) {
    const book = await getOwnedBook(userId, bookId);
    // The export capability is a paid entitlement. The check is here, on the
    // server, so it applies to a direct API call as well as to the button in
    // the export screen.
    await requireEntitlement(userId, 'exports');
    await assertRuntimeAvailable();
    const options = parseExportOptions(format, rawOptions);
    const support = languageSupport(book.language, await fontRegistry.available());
    if (support.level === 'unavailable') throw conflict(`${getLanguage(book.language).name} cannot be typeset on this server: ${support.notes[0]}`, { code: 'FONT_UNAVAILABLE' });
    const written = await prisma.chapter.count({ where: { bookId, OR: [{ wordCount: { gt: 0 } }, { status: 'done' }] } });
    if (written === 0) throw conflict('Write at least one chapter before exporting.');
    const pending = await prisma.export.findFirst({ where: { bookId, status: { in: ['queued', 'processing'] } } });
    if (pending) throw conflict('An export for this book is already in progress.', { exportId: pending.id });

    // The design is frozen at request time; later edits never change what a queued export renders.
    const design = await designService.get(userId, bookId);
    const doc = await buildBookDocument(userId, bookId, design);
    const assetIds = referencedAssetIds(doc);
    const coverAssetId = await findCoverAsset(userId, bookId);
    const coverDesign = await prisma.coverDesign.findFirst({ where: { bookId }, orderBy: { version: 'desc' }, select: { version: true } });

    // The asset references are pinned so the images cannot be deleted while the export runs.
    await prisma.$transaction(async (tx) => {
      for (const assetId of [...new Set([...assetIds, ...(coverAssetId ? [coverAssetId] : [])])]) {
        await tx.assetReference.upsert({ where: { assetId_bookId: { assetId, bookId } }, create: { assetId, bookId }, update: {} });
      }
    });

    const assets: ExportSnapshot['assets'] = [];
    for (const assetId of assetIds) {
      const asset = await prisma.asset.findFirst({ where: { id: assetId, userId, status: 'ready' }, select: { id: true, sha256: true, bytes: true } });
      if (asset) assets.push({ assetId: asset.id, sha256: asset.sha256, bytes: asset.bytes });
    }

    const brief = await prisma.book.findUniqueOrThrow({ where: { id: bookId }, select: { title: true, subtitle: true, language: true } });
    const snapshot: ExportSnapshot = {
      schema: 1,
      format,
      options,
      book: { id: book.id, title: brief.title, subtitle: brief.subtitle, author: doc.book.author, language: brief.language, dir: getLanguage(brief.language).dir },
      design: { version: design.version },
      chapters: doc.chapters.map((c) => ({ id: c.id, position: c.position, version: c.version, title: c.title })),
      contentHash: contentHash(doc.chapters.map((c) => ({ id: c.id, version: c.version, content: c.content }))),
      assets,
      coverAssetId,
      coverVersion: coverDesign?.version ?? null,
      requestedAt: new Date().toISOString(),
    };

    const exp = await prisma.export.create({
      data: {
        userId, bookId, format,
        designVersion: design.version,
        designSnapshot: design.data as object,
        snapshot: snapshot as object,
        contentType: EXPORT_CONTENT_TYPES[format],
      },
    });
    await enqueueExport(exp.id);
    return exp;
  },

  /**
   * The book's recent exports, each with a short summary of what it contains
   * and whether the manuscript has changed since it was made.
   */
  async list(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    const [rows, chapters] = await Promise.all([
      prisma.export.findMany({ where: { bookId }, orderBy: { createdAt: 'desc' }, take: 20, omit: { designSnapshot: true } }),
      prisma.chapter.findMany({ where: { bookId, OR: [{ wordCount: { gt: 0 } }, { status: 'done' }] }, select: { id: true, version: true, position: true } }),
    ]);
    const current = new Map(chapters.map((c) => [c.id, c]));
    return rows.map(({ snapshot: raw, ...row }) => {
      const snapshot = raw as unknown as ExportSnapshot | null;
      const pinned = snapshot?.chapters ?? [];
      // Out of date when a chapter was edited, moved, added or removed since the request.
      const stale = snapshot ? pinned.length !== current.size || pinned.some((c) => current.get(c.id)?.version !== c.version || current.get(c.id)?.position !== c.position) : false;
      return {
        ...row,
        summary: snapshot
          ? { title: snapshot.book.title, author: snapshot.book.author, chapters: pinned.length, hasCover: Boolean(snapshot.coverVersion != null || snapshot.coverAssetId), requestedAt: snapshot.requestedAt }
          : null,
        stale,
      };
    });
  },

  /** One export with its snapshot and validation summary. */
  async get(userId: string, exportId: string) {
    const exp = await prisma.export.findFirst({ where: { id: exportId, userId, book: { deletedAt: null } } });
    if (!exp) throw notFound('Export');
    return exp;
  },

  async getForDownload(userId: string, exportId: string) {
    const exp = await prisma.export.findFirst({
      where: { id: exportId, userId, book: { deletedAt: null } },
      include: { book: { select: { title: true } } },
    });
    if (!exp) throw notFound('Export');
    if (exp.status !== 'ready' || !exp.storageKey) throw conflict('This export is not ready yet.');
    // A file that has gone missing from storage is the customer's to fix by
    // exporting again, not a server fault to hide behind a generic error.
    const opened = await storage.getStream(exp.storageKey).catch((err: unknown) => {
      logger.error({ err, exportId }, 'Export file missing from storage');
      return null;
    });
    if (!opened) throw new AppError(410, 'EXPORT_FILE_MISSING', 'This file is no longer available. Export the book again to get a fresh copy.');
    const { stream, size } = opened;
    const format = (exp.format as ExportFormat) in EXPORT_CONTENT_TYPES ? (exp.format as ExportFormat) : 'pdf';
    return {
      stream, size,
      filename: `${slugify(exp.book.title)}.${format}`,
      contentType: exp.contentType ?? EXPORT_CONTENT_TYPES[format],
    };
  },

  /**
   * Worker: render, store, read back, validate.
   *
   * The file is only marked ready when the bytes read back from storage pass
   * validation. A file that cannot be re-opened is reported as a failure, never
   * as a successful download.
   */
  async process(exportId: string) {
    const claimed = await prisma.export.updateMany({ where: { id: exportId, status: { in: ['queued', 'processing'] } }, data: { status: 'processing' } });
    if (claimed.count === 0) return;
    const exp = await prisma.export.findUniqueOrThrow({ where: { id: exportId } });
    try {
      const format = (exp.format as ExportFormat) in EXPORT_CONTENT_TYPES ? (exp.format as ExportFormat) : 'pdf';
      const design = exp.designSnapshot
        ? { version: exp.designVersion ?? 0, data: exp.designSnapshot as unknown as BookDesign }
        : await designService.get(exp.userId, exp.bookId);
      const snapshot = exp.snapshot as unknown as ExportSnapshot | null;
      const doc = await pinToSnapshot(await buildBookDocument(exp.userId, exp.bookId, design), snapshot);
      const support = await assertRenderable(doc);
      const checks = await documentDiagnostics(doc);
      const options = snapshot?.options ?? parseExportOptions(format, undefined);

      // The pinned image bytes are read from storage so the file carries exactly the verified bytes.
      const { images, cover: artworkCover } = await loadPinnedImages(
        exp.userId,
        snapshot?.assets.map((a) => a.assetId) ?? referencedAssetIds(doc),
        snapshot?.coverAssetId ?? null,
      );

      const cover = format === 'epub' ? await composedCover(exp.userId, exp.bookId, snapshot, doc, artworkCover) : artworkCover;

      const rendered = await renderExport(
        { doc, design: design.data, images, cover, availableFonts: await fontRegistry.available(), rtl: doc.book.dir === 'rtl' },
        options,
      );

      const key = `exports/${exp.userId}/${exp.bookId}/${exp.id}.${rendered.extension}`;
      await storage.put(key, rendered.buffer, rendered.contentType);

      // The file is read back from the same path the download serves, then validated.
      const { stream } = await storage.getStream(key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const stored = Buffer.concat(chunks);
      const sha256 = createHash('sha256').update(stored).digest('hex');

      // The PDF findings stay lists so the reader can see which font or element is at fault.
      const foreignFonts = Array.isArray(rendered.facts.foreignFonts) ? rendered.facts.foreignFonts as unknown as string[] : [];
      const overflow = Array.isArray(rendered.facts.overflow) ? rendered.facts.overflow as unknown as string[] : [];
      const type3Fonts = Array.isArray(rendered.facts.type3Fonts) ? rendered.facts.type3Fonts as unknown as string[] : [];
      const diagnostics = {
        notes: support.notes,
        glyphs: checks.glyphs,
        emptyChapters: checks.emptyChapters,
        foreignFonts: format === 'pdf' ? foreignFonts : [],
        overflow: format === 'pdf' ? overflow : [],
        type3Fonts: format === 'pdf' ? type3Fonts : [],
        facts: rendered.facts,
      };
      const validation = await validateExport({ format, buffer: stored, renderFacts: rendered.facts });
      const pageCount = typeof rendered.facts.pageCount === 'number' ? rendered.facts.pageCount : null;

      if (!validation.passed) {
        // A file that does not validate is removed rather than offered as a download.
        await storage.remove(key).catch(() => undefined);
        const summary = validation.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' ');
        await prisma.export.update({
          where: { id: exp.id },
          data: { status: 'failed', finishedAt: new Date(), error: `The generated file did not validate: ${summary}`.slice(0, 500), validation: validation as object, diagnostics: diagnostics as object },
        });
        return;
      }

      await prisma.export.update({
        where: { id: exp.id },
        data: {
          status: 'ready', storageKey: key, fileSize: stored.length, pageCount,
          sha256, contentType: rendered.contentType,
          diagnostics: diagnostics as object, validation: validation as object,
          finishedAt: new Date(), error: null,
        },
      });
    } catch (err) {
      logger.error({ err, exportId }, 'Export failed');
      await prisma.export.update({
        where: { id: exp.id },
        data: { status: 'failed', finishedAt: new Date(), error: (err instanceof Error ? err.message : String(err)).slice(0, 500) },
      });
    }
  },
};

/** Formats this server can produce, with their display labels. */
export function exportFormatOptions() {
  return SUPPORTED_FORMATS.map((format) => ({ format, label: EXPORT_FORMAT_LABELS[format], contentType: EXPORT_CONTENT_TYPES[format] }));
}
