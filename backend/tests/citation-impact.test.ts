import { afterAll, describe, expect, it } from 'vitest';
import { bookBriefSchema } from '@ebook/shared';
import { prisma } from '../src/database/prisma.js';
import { closeQueues } from '../src/queues/index.js';
import { bookService } from '../src/services/books/bookService.js';
import { qualityService } from '../src/services/quality/qualityService.js';
import { markdownToTiptap } from '../src/services/editor/markdownToTiptap.js';
import { sourceService } from '../src/services/sources/sourceService.js';
import { brief, createUser, ORIGIN } from './helpers.js';

afterAll(async () => { await closeQueues(); await prisma.$disconnect(); });

/**
 * S11 citation-impact integration tests.
 *
 * A chapter cites the source passages that support it. These tests cover what
 * happens to that citation when the source is deleted or replaced, and that the
 * quality report cross-references the affected citations.
 */

async function setup(prefix: string) {
  const user = await createUser(prefix);
  const book = await bookService.create(user.user.id, bookBriefSchema.parse(brief({ title: 'Meal Prep Manual' }).brief));
  return { ...user, book, url: `/api/v1/books/${book.id}/sources` };
}

/** Imports a note and links it to a chapter, which is what a citation is. */
async function citedSource(prefix: string, text = 'Batch cooking saves time.\n\nFreezing keeps food safe.') {
  const a = await setup(prefix);
  const up = await a.agent.post(a.url).set('Origin', ORIGIN).set('Content-Type', 'text/plain').query({ title: 'Kitchen notes', format: 'notes' }).send(text);
  expect(up.status).toBe(201);
  const sourceId = up.body.source.id;
  const chapter = await prisma.chapter.create({
    data: { bookId: a.book.id, position: 0, title: 'Cooking', status: 'done', wordCount: 5, contentJson: markdownToTiptap('Cooking chapter text.') as object },
  });
  await sourceService.link(a.user.id, sourceId, { chapterId: chapter.id, locators: ['p1'], note: 'Supports the chapter.' });
  return { ...a, sourceId, chapter };
}

/** The quality report of a book, run through the same service the route uses. */
async function report(userId: string, bookId: string) {
  const result = await qualityService.runRules(userId, bookId);
  const detail = await qualityService.get(userId, bookId, result.reportId);
  return detail.findings;
}

describe('citation impact', () => {
  it('keeps a citation that still holds in the current state', async () => {
    const a = await citedSource('impact-current');
    const citations = await a.agent.get(`/api/v1/chapters/${a.chapter.id}/sources`).set('Origin', ORIGIN).expect(200);
    expect(citations.body.citations).toHaveLength(1);
    expect(citations.body.citations[0].state).toBe('current');
    expect(citations.body.citations[0].stale).toBe(false);
    expect(citations.body.citations[0].reason).toBe('');
  });

  it('reports a deleted source as a deleted citation', async () => {
    const a = await citedSource('impact-deleted');
    await a.agent.delete(`/api/v1/sources/${a.sourceId}`).set('Origin', ORIGIN).expect(204);

    const citations = await a.agent.get(`/api/v1/chapters/${a.chapter.id}/sources`).set('Origin', ORIGIN).expect(200);
    expect(citations.body.citations).toHaveLength(1);
    expect(citations.body.citations[0].state).toBe('deleted');
    expect(citations.body.citations[0].stale).toBe(true);
    expect(citations.body.citations[0].reason).toContain('deleted');
  });

  it('keeps the citation after the source is deleted, so the loss is visible', async () => {
    const a = await citedSource('impact-tombstone');
    await a.agent.delete(`/api/v1/sources/${a.sourceId}`).set('Origin', ORIGIN).expect(204);

    // The link is a tombstone, not gone: the chapter still cites the source.
    const links = await prisma.chapterSourceLink.findMany({ where: { bookId: a.book.id } });
    expect(links).toHaveLength(1);
    // The source row is kept with the deletion recorded.
    const source = await prisma.researchSource.findUnique({ where: { id: a.sourceId } });
    expect(source?.deletedAt).toBeTruthy();
  });

  it('hides a deleted source from the book source list', async () => {
    const a = await citedSource('impact-hidden');
    await a.agent.delete(`/api/v1/sources/${a.sourceId}`).set('Origin', ORIGIN).expect(204);
    const list = await a.agent.get(a.url).set('Origin', ORIGIN).expect(200);
    expect(list.body.sources).toHaveLength(0);
  });

  it('reports a re-imported source as a changed citation', async () => {
    const a = await citedSource('impact-reimported');
    // The same source is imported again, so its passages hold different words.
    const up = await a.agent.post(a.url).set('Origin', ORIGIN).set('Content-Type', 'text/plain').query({ title: 'Kitchen notes v2', format: 'notes' }).send('Batch cooking saves a lot of time.\n\nFreezing keeps food safe.');
    expect(up.status).toBe(201);
    await prisma.researchSource.update({ where: { id: a.sourceId }, data: { version: 2 } });

    const citations = await a.agent.get(`/api/v1/chapters/${a.chapter.id}/sources`).set('Origin', ORIGIN).expect(200);
    expect(citations.body.citations[0].state).toBe('changed');
    expect(citations.body.citations[0].stale).toBe(true);
  });

  it('reports a citation whose passage no longer exists', async () => {
    const a = await citedSource('impact-missing');
    // The source is re-imported with fewer passages, so p1 is gone.
    await prisma.sourceVersion.updateMany({ where: { sourceId: a.sourceId }, data: { passages: [{ locator: 'p5', paragraph: 5, page: null, text: 'Different content.', truncated: false }] } });
    await prisma.researchSource.update({ where: { id: a.sourceId }, data: { version: 2 } });

    const citations = await a.agent.get(`/api/v1/chapters/${a.chapter.id}/sources`).set('Origin', ORIGIN).expect(200);
    expect(citations.body.citations[0].state).toBe('missing-passage');
    expect(citations.body.citations[0].missingLocators).toEqual(['p1']);
  });
});

describe('quality report cross-references affected citations', () => {
  it('reports a deleted source as an error on the chapter that cited it', async () => {
    const a = await citedSource('report-deleted');
    await a.agent.delete(`/api/v1/sources/${a.sourceId}`).set('Origin', ORIGIN).expect(204);

    const findings = await report(a.user.id, a.book.id);
    const finding = findings.find((f: { ruleId: string }) => f.ruleId === 'citation.source-deleted');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('error');
    expect(finding!.category).toBe('evidence');
    expect(finding!.chapterId).toBe(a.chapter.id);
    expect(finding!.message).toContain('Kitchen notes');
  });

  it('reports a re-imported source as a warning', async () => {
    const a = await citedSource('report-changed');
    await prisma.sourceVersion.updateMany({ where: { sourceId: a.sourceId }, data: { passages: [{ locator: 'p1', paragraph: 1, page: null, text: 'Rewritten words.', truncated: false }] } });
    await prisma.researchSource.update({ where: { id: a.sourceId }, data: { version: 2 } });

    const findings = await report(a.user.id, a.book.id);
    const finding = findings.find((f: { ruleId: string }) => f.ruleId === 'citation.source-changed');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warning');
  });

  it('reports a citation whose passage no longer exists', async () => {
    const a = await citedSource('report-missing');
    await prisma.sourceVersion.updateMany({ where: { sourceId: a.sourceId }, data: { passages: [{ locator: 'p5', paragraph: 5, page: null, text: 'Different content.', truncated: false }] } });
    await prisma.researchSource.update({ where: { id: a.sourceId }, data: { version: 2 } });

    const findings = await report(a.user.id, a.book.id);
    const finding = findings.find((f: { ruleId: string }) => f.ruleId === 'citation.passage-missing');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('error');
    expect(finding!.message).toContain('p1');
  });

  it('says nothing about a citation that still holds', async () => {
    const a = await citedSource('report-clean');
    const findings = await report(a.user.id, a.book.id);
    expect(findings.filter((f: { ruleId: string }) => f.ruleId.startsWith('citation.'))).toHaveLength(0);
  });

  it('redoes the report when a source is deleted, because the citations changed', async () => {
    const a = await citedSource('report-stale');
    const first = await qualityService.runRules(a.user.id, a.book.id);
    expect(first.reused).toBe(false);

    // The second run reuses the report, because nothing has changed yet.
    const second = await qualityService.runRules(a.user.id, a.book.id);
    expect(second.reused).toBe(true);

    // Deleting the source changes the citations, so the report is redone.
    await a.agent.delete(`/api/v1/sources/${a.sourceId}`).set('Origin', ORIGIN).expect(204);
    const third = await qualityService.runRules(a.user.id, a.book.id);
    expect(third.reused).toBe(false);
    const detail = await qualityService.get(a.user.id, a.book.id, third.reportId);
    expect(detail.findings.some((f: { ruleId: string }) => f.ruleId === 'citation.source-deleted')).toBe(true);
  });

  it('does not report another book’s citations', async () => {
    const a = await citedSource('report-owner');
    const b = await setup('report-owner-other');
    await a.agent.delete(`/api/v1/sources/${a.sourceId}`).set('Origin', ORIGIN).expect(204);

    const findings = await report(b.user.id, b.book.id);
    expect(findings.filter((f: { ruleId: string }) => f.ruleId.startsWith('citation.'))).toHaveLength(0);
  });
});
