import { pinImageDocuments } from '../assets/assetService.js';
import { bookBriefSchema, outlineSchema, type LibraryQuery } from '@ebook/shared';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { assertIdle, lockBook } from '../generation/jobRuntime.js';
import type { Tx } from '../credits/creditService.js';

export async function lockProject(tx: Tx, userId: string, id: string, active = false) {
  const rows = await tx.$queryRaw<{ id: string; archivedAt: Date | null }[]>`SELECT id, "archivedAt" FROM projects WHERE id = ${id} AND "userId" = ${userId} AND "deletedAt" IS NULL FOR UPDATE`;
  if (!rows.length || (active && rows[0].archivedAt)) throw notFound('Active project');
}
const archiveWhere = (value: LibraryQuery['archived']) => value === 'all' ? {} : { archivedAt: value === 'active' ? null : { not: null } };

export const libraryService = {
  async list(userId: string, query: LibraryQuery) {
    if (query.projectId && query.projectId !== '_none' && !await prisma.project.findFirst({ where: { id: query.projectId, userId, deletedAt: null } })) throw notFound('Project');
    const where: Prisma.BookWhereInput = { userId, deletedAt: null, ...archiveWhere(query.archived),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.projectId ? { projectId: query.projectId === '_none' ? null : query.projectId } : {}),
      ...(query.language ? { language: query.language } : {}), ...(query.bookType ? { bookType: query.bookType } : {}), ...(query.status ? { status: query.status } : {}),
    };
    if (query.cursor && !await prisma.book.findFirst({ where: { ...where, id: query.cursor } })) throw badRequest('This page changed. Refresh the library.');
    const orderBy: Prisma.BookOrderByWithRelationInput[] = query.sort === 'title' ? [{ title: 'asc' }, { id: 'asc' }] : [{ createdAt: query.sort === 'oldest' ? 'asc' : 'desc' }, { id: query.sort === 'oldest' ? 'asc' : 'desc' }];
    const rows = await prisma.book.findMany({ where, orderBy, take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), include: { _count: { select: { chapters: true } } } });
    const page = rows.slice(0, query.limit);
    const words = await prisma.chapter.groupBy({ by: ['bookId'], where: { bookId: { in: page.map(b => b.id) } }, _sum: { wordCount: true } });
    return { books: page.map(({ _count, ...b }) => ({ ...b, chapterCount: _count.chapters, wordCount: words.find(w => w.bookId === b.id)?._sum.wordCount ?? 0 })), nextCursor: rows.length > query.limit ? page.at(-1)!.id : null };
  },
  async projects(userId: string, query: LibraryQuery) {
    const where: Prisma.ProjectWhereInput = { userId, deletedAt: null, ...archiveWhere(query.archived), ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}) };
    if (query.cursor && !await prisma.project.findFirst({ where: { ...where, id: query.cursor } })) throw badRequest('This page changed. Refresh projects.');
    const orderBy: Prisma.ProjectOrderByWithRelationInput[] = query.sort === 'title' ? [{ name: 'asc' }, { id: 'asc' }] : [{ createdAt: query.sort === 'oldest' ? 'asc' : 'desc' }, { id: query.sort === 'oldest' ? 'asc' : 'desc' }];
    const rows = await prisma.project.findMany({ where, orderBy, take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), include: { _count: { select: { books: { where: { deletedAt: null } } } } } });
    return { projects: rows.slice(0, query.limit), nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : null };
  },
  async updateProject(userId: string, projectId: string, input: { name?: string; description?: string; archived?: boolean }) {
    return prisma.$transaction(async tx => {
      await lockProject(tx, userId, projectId);
      const { archived, ...fields } = input;
      return tx.project.update({ where: { id: projectId }, data: { ...fields, ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}) } });
    });
  },
  async deleteProject(userId: string, projectId: string) {
    await prisma.$transaction(async tx => {
      await lockProject(tx, userId, projectId);
      await tx.book.updateMany({ where: { projectId, userId }, data: { projectId: null } });
      await tx.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } });
    });
  },
  async organize(userId: string, bookId: string, input: { projectId?: string | null; archived?: boolean }) {
    return prisma.$transaction(async tx => {
      // Project then book is also the order used when deleting a project.
      if (input.projectId) await lockProject(tx, userId, input.projectId, true);
      await lockBook(tx, bookId, userId);
      if (input.archived) await assertIdle(tx, bookId);
      return tx.book.update({ where: { id: bookId }, data: { ...(input.projectId !== undefined ? { projectId: input.projectId } : {}), ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}) } });
    });
  },
  async duplicate(userId: string, bookId: string, includeManuscript: boolean) {
    return prisma.$transaction(async tx => {
      await lockBook(tx, bookId, userId);
      await assertIdle(tx, bookId);
      const source = await tx.book.findUniqueOrThrow({ where: { id: bookId }, include: { brief: true, outlines: { orderBy: { version: 'desc' }, take: 1 }, chapters: { orderBy: { position: 'asc' } } } });
      const outline = source.outlines[0];
      const chapters = includeManuscript ? source.chapters : [];
      const title = `${source.title.slice(0, 190)} (copy)`;
      const copy = await tx.book.create({ data: {
        userId, title, subtitle: source.subtitle, language: source.language, bookType: source.bookType,
        status: chapters.length && chapters.every(c => c.status === 'done') ? 'written' : outline ? 'outline_ready' : 'draft',
        ...(source.brief ? { brief: { create: { data: { ...bookBriefSchema.parse(source.brief.data), title } } } } : {}),
        ...(outline ? { outlines: { create: { version: 1, data: { ...outlineSchema.parse(outline.data), title }, approvedAt: includeManuscript ? outline.approvedAt : null } } } : {}),
        chapters: { create: chapters.map(c => ({ position: c.position, title: c.title, goal: c.goal, keyPoints: c.keyPoints ?? [], targetWords: c.targetWords, status: c.status === 'done' ? 'done' : 'pending', contentJson: c.contentJson ?? Prisma.DbNull, summary: c.summary, wordCount: c.wordCount })) },
      } });
      await pinImageDocuments(tx, userId, copy.id, chapters.map(chapter => chapter.contentJson));
      return copy;
    }, { isolationLevel: 'RepeatableRead' });
  },
};
