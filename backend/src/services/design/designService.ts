import { LANGUAGES, TEMPLATES, applyTemplate, bookDesignSchema, defaultBookDesign, designChanges, findTemplate, languageSupport, type BookDesign } from '@ebook/shared';
import type { Tx } from '../credits/creditService.js';
import { prisma } from '../../database/prisma.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { getBrief, getOwnedBook } from '../books/bookService.js';
import { lockBook } from '../generation/jobRuntime.js';
import { fontRegistry } from './fonts.js';

export interface SavedDesign { version: number; data: BookDesign; action: string; detail: string; createdAt: Date | null }

const STALE = 'The design changed in another tab. Reload the saved version or keep your draft and review before saving again.';
function parse(row: { version: number; data: unknown; action: string; detail: string; createdAt: Date }): SavedDesign {
  return { version: row.version, data: bookDesignSchema.parse(row.data), action: row.action, detail: row.detail, createdAt: row.createdAt };
}
async function defaults(bookId: string, language: string): Promise<SavedDesign> {
  const brief = await getBrief(bookId);
  const templateId = brief.bookType === 'lead_magnet' ? 'editorial' : 'standard';
  return { version: 0, data: defaultBookDesign(language, brief.authorName ?? '', new Date().getUTCFullYear(), templateId), action: 'default', detail: '', createdAt: null };
}
/** Appends a version after verifying the caller edited the latest one. */
async function append(userId: string, bookId: string, baseVersion: number, build: (tx: Tx, current: SavedDesign) => Promise<{ data: BookDesign; action: 'save' | 'template' | 'restore'; detail: string }>) {
  return prisma.$transaction(async tx => {
    await lockBook(tx, bookId, userId);
    const latest = await tx.bookDesign.findFirst({ where: { bookId }, orderBy: { version: 'desc' } });
    if ((latest?.version ?? 0) !== baseVersion) throw conflict(STALE, { latestVersion: latest?.version ?? 0 });
    const book = await tx.book.findUniqueOrThrow({ where: { id: bookId }, select: { language: true } });
    const current = latest ? parse(latest) : await defaults(bookId, book.language);
    const next = await build(tx, current);
    const data = bookDesignSchema.parse(next.data);
    const row = await tx.bookDesign.create({ data: { bookId, version: baseVersion + 1, data, action: next.action, detail: next.detail } });
    return parse(row);
  });
}

export const designService = {
  /** Latest saved design, a specific version, or language-aware defaults (version 0) for books without one. */
  async get(userId: string, bookId: string, version?: number): Promise<SavedDesign> {
    const book = await getOwnedBook(userId, bookId);
    if (version === 0) return defaults(bookId, book.language);
    const row = await prisma.bookDesign.findFirst({ where: { bookId, ...(version !== undefined ? { version } : {}) }, orderBy: { version: 'desc' } });
    if (version !== undefined && !row) throw notFound('Design version');
    return row ? parse(row) : defaults(bookId, book.language);
  },
  async history(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    const rows = await prisma.bookDesign.findMany({ where: { bookId }, orderBy: { version: 'desc' }, take: 50, select: { version: true, action: true, detail: true, createdAt: true } });
    return { versions: rows };
  },
  save(userId: string, bookId: string, baseVersion: number, input: BookDesign) {
    const data = bookDesignSchema.parse(input);
    return append(userId, bookId, baseVersion, async (_tx, current) => {
      // Hand edits to template-controlled settings detach the design from its template snapshot label.
      const edited = current.data.template && designChanges(current.data, data).length > 0;
      return { data: { ...data, template: edited ? null : data.template }, action: 'save', detail: '' };
    });
  },
  /** Snapshots the template's settings into a new version; front/back matter is never changed. */
  applyTemplate(userId: string, bookId: string, baseVersion: number, templateId: string, templateVersion: number) {
    const template = findTemplate(templateId, templateVersion);
    if (!template) throw badRequest('This template version is not available.');
    return append(userId, bookId, baseVersion, async (_tx, current) => ({ data: applyTemplate(current.data, template), action: 'template', detail: `${template.id}@${template.version}` }));
  },
  /** Restoring copies an older snapshot into a new version, so the restore itself can be undone. */
  restore(userId: string, bookId: string, baseVersion: number, version: number) {
    return append(userId, bookId, baseVersion, async tx => {
      const source = version === 0 ? null : await tx.bookDesign.findUnique({ where: { bookId_version: { bookId, version } } });
      if (version !== 0 && !source) throw notFound('Design version');
      const book = await tx.book.findUniqueOrThrow({ where: { id: bookId }, select: { language: true } });
      const data = source ? parse(source).data : (await defaults(bookId, book.language)).data;
      return { data, action: 'restore', detail: String(version) };
    });
  },
  templates() {
    return TEMPLATES.map(t => ({ ...t }));
  },
  async capabilities() {
    const available = await fontRegistry.available();
    return {
      languages: LANGUAGES.map(l => languageSupport(l.code, available)),
      fonts: await fontRegistry.families(),
      limits: [
        'Chromium does not insert blank pages for right-hand chapter openings, so chapters start on the next page.',
        'The printed table of contents links to chapters but does not show page numbers.',
        'Page numbering counts every physical page; front-matter pages are unnumbered rather than Roman-numbered.',
      ],
    };
  },
};
