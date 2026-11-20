import { publishingChecks, type Marketplace, type PublishingReport } from '@ebook/shared';
import { prisma } from '../../database/prisma.js';
import { getOwnedBook, getBrief } from '../books/bookService.js';

export async function publishingReport(userId: string, bookId: string, destination: Marketplace): Promise<PublishingReport> {
  const book = await getOwnedBook(userId, bookId);
  const [brief, chapters, files] = await Promise.all([
    getBrief(bookId),
    prisma.chapter.findMany({ where: { bookId }, orderBy: { position: 'asc' }, select: { id: true, version: true, status: true, wordCount: true } }),
    prisma.export.findMany({ where: { bookId, userId, status: 'ready', storageKey: { not: null } }, orderBy: { createdAt: 'desc' }, take: 20, select: { format: true, fileSize: true } }),
  ]);
  const checks = publishingChecks({ destination, title: book.title, language: book.language, authorName: brief.authorName, chapters, files });
  return { bookId, destination, rulesVersion: '2026-11-20.1', checkedAt: new Date().toISOString(), chapterVersions: chapters.map(({ id, version }) => ({ id, version })), checks, status: checks.some(c => c.status === 'blocker') ? 'blocked' : 'review_required' };
}
