import { afterAll, describe, expect, it } from 'vitest';
import { bookBriefSchema, libraryQuerySchema } from '@ebook/shared';
import { prisma } from '../src/database/prisma.js';
import { closeQueues } from '../src/queues/index.js';
import { bookService } from '../src/services/books/bookService.js';
import { libraryService } from '../src/services/books/libraryService.js';
import { outlineService } from '../src/services/outline/outlineService.js';
import { generationService } from '../src/services/generation/generationService.js';
import { brief, createUser, ORIGIN } from './helpers.js';

async function planning() {
  const owner = await createUser('library');
  const response = await owner.agent.post('/api/v1/books').set('Origin', ORIGIN).send(brief()).expect(201);
  await outlineService.process(response.body.job.id);
  return { ...owner, bookId: response.body.book.id as string };
}
afterAll(async () => { await closeQueues(); await prisma.$disconnect(); });

describe('library and planning', () => {
  it('rejects foreign assignment and scopes project updates', async () => {
    const a = await planning(); const b = await createUser('other-project');
    const p = (await b.agent.post('/api/v1/projects').set('Origin', ORIGIN).send({ name: 'Private project' }).expect(201)).body.project;
    await a.agent.patch(`/api/v1/books/${a.bookId}`).set('Origin', ORIGIN).send({ projectId: p.id }).expect(404);
    await a.agent.patch(`/api/v1/projects/${p.id}`).set('Origin', ORIGIN).send({ name: 'No access' }).expect(404);
    await a.agent.get(`/api/v1/books?projectId=${p.id}`).expect(404);
  });
  it('assigns, archives, restores and removes projects without removing manuscripts', async () => {
    const a = await planning();
    const p = (await a.agent.post('/api/v1/projects').set('Origin', ORIGIN).send({ name: 'Series', description: 'Keep this description' }).expect(201)).body.project;
    await a.agent.patch(`/api/v1/books/${a.bookId}`).set('Origin', ORIGIN).send({ projectId: p.id }).expect(200);
    await a.agent.patch(`/api/v1/projects/${p.id}`).set('Origin', ORIGIN).send({ name: 'Updated series', archived: true }).expect(200);
    const archived = (await a.agent.get('/api/v1/projects?archived=archived').expect(200)).body.projects[0];
    expect(archived.name).toBe('Updated series');
    expect(archived.description).toBe('Keep this description');
    await a.agent.patch(`/api/v1/books/${a.bookId}`).set('Origin', ORIGIN).send({ projectId: p.id }).expect(404);
    await a.agent.patch(`/api/v1/books/${a.bookId}`).set('Origin', ORIGIN).send({ archived: true }).expect(200);
    expect((await a.agent.get('/api/v1/books').expect(200)).body.books).toHaveLength(0);
    expect((await a.agent.get('/api/v1/books?archived=archived').expect(200)).body.books).toHaveLength(1);
    await a.agent.patch(`/api/v1/books/${a.bookId}`).set('Origin', ORIGIN).send({ archived: false }).expect(200);
    await a.agent.delete(`/api/v1/projects/${p.id}`).set('Origin', ORIGIN).expect(204);
    expect((await prisma.book.findUniqueOrThrow({ where: { id: a.bookId } })).projectId).toBeNull();
    await a.agent.get(`/api/v1/books/${a.bookId}`).expect(200);
  });
  it('paginates deterministically across tied timestamps and validates filters', async () => {
    const { user, agent } = await createUser('pagination');
    const parsed = bookBriefSchema.parse(brief().brief);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await bookService.create(user.id, parsed)).id);
    await prisma.book.updateMany({ where: { id: { in: ids } }, data: { createdAt: new Date('2026-01-01') } });
    const first = await libraryService.list(user.id, libraryQuerySchema.parse({ limit: 2 }));
    const second = await libraryService.list(user.id, libraryQuerySchema.parse({ limit: 2, cursor: first.nextCursor }));
    const third = await libraryService.list(user.id, libraryQuerySchema.parse({ limit: 2, cursor: second.nextCursor }));
    const all = [...first.books, ...second.books, ...third.books].map(b => b.id);
    expect(new Set(all).size).toBe(5); expect(third.nextCursor).toBeNull();
    await agent.get('/api/v1/books?limit=9999').expect(400);
    await agent.get('/api/v1/books?language=not-a-language').expect(400);
  });
  it('copies an independent manuscript without jobs, exports, history or credit spend', async () => {
    const a = await planning();
    await outlineService.approve(a.user.id, a.bookId, 1);
    const job = await generationService.start(a.user.id, a.bookId); await generationService.process(job.id);
    const before = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: a.user.id } });
    const source = await prisma.chapter.findMany({ where: { bookId: a.bookId }, orderBy: { position: 'asc' } });
    const copy = await libraryService.duplicate(a.user.id, a.bookId, true);
    const chapters = await prisma.chapter.findMany({ where: { bookId: copy.id }, orderBy: { position: 'asc' } });
    expect(chapters.map(c => c.contentJson)).toEqual(source.map(c => c.contentJson));
    expect(chapters.every(c => !source.some(s => s.id === c.id))).toBe(true);
    expect(await prisma.generationJob.count({ where: { bookId: copy.id } })).toBe(0);
    expect(await prisma.documentVersion.count({ where: { chapterId: { in: chapters.map(c => c.id) } } })).toBe(0);
    expect((await prisma.creditWallet.findUniqueOrThrow({ where: { userId: a.user.id } })).balance).toBe(before.balance);
    const planCopy = await libraryService.duplicate(a.user.id, a.bookId, false);
    expect(await prisma.chapter.count({ where: { bookId: planCopy.id } })).toBe(0);
    expect((await prisma.outline.findFirstOrThrow({ where: { bookId: planCopy.id } })).approvedAt).toBeNull();
  });
  it('rejects stale outline saves and approval, and makes repeated approval harmless', async () => {
    const a = await planning();
    const original = await outlineService.detail(a.user.id, a.bookId, 1);
    const data = original.data as Parameters<typeof outlineService.update>[2];
    await a.agent.put(`/api/v1/books/${a.bookId}/outline`).set('Origin', ORIGIN).send({ ...data, baseVersion: 1 }).expect(200);
    await a.agent.put(`/api/v1/books/${a.bookId}/outline`).set('Origin', ORIGIN).send({ ...data, baseVersion: 1 }).expect(409);
    await a.agent.post(`/api/v1/books/${a.bookId}/outline/approve`).set('Origin', ORIGIN).expect(400);
    await a.agent.post(`/api/v1/books/${a.bookId}/outline/approve`).set('Origin', ORIGIN).send({ version: 1 }).expect(409);
    await outlineService.approve(a.user.id, a.bookId, 2);
    const ids = (await prisma.chapter.findMany({ where: { bookId: a.bookId } })).map(c => c.id);
    await outlineService.approve(a.user.id, a.bookId, 2);
    expect((await prisma.chapter.findMany({ where: { bookId: a.bookId } })).map(c => c.id)).toEqual(ids);
  });
  it('restores planning without changing written chapters or allowing destructive approval', async () => {
    const a = await planning();
    await outlineService.approve(a.user.id, a.bookId, 1);
    const job = await generationService.start(a.user.id, a.bookId); await generationService.process(job.id);
    const before = await prisma.chapter.findMany({ where: { bookId: a.bookId }, orderBy: { position: 'asc' } });
    await outlineService.restore(a.user.id, a.bookId, 1, 1);
    await expect(outlineService.restore(a.user.id, a.bookId, 1, 1)).rejects.toThrow('changed');
    await a.agent.post(`/api/v1/books/${a.bookId}/outline/approve`).set('Origin', ORIGIN).send({ version: 2 }).expect(409);
    expect(await prisma.chapter.findMany({ where: { bookId: a.bookId }, orderBy: { position: 'asc' } })).toEqual(before);
    const b = await createUser('history-intruder');
    await b.agent.get(`/api/v1/books/${a.bookId}/outlines`).expect(404);
    await b.agent.post(`/api/v1/books/${a.bookId}/outlines/1/restore`).set('Origin', ORIGIN).send({ baseVersion: 2 }).expect(404);
  });
  it('rejects archive and duplication during generation and retains deleted-book isolation', async () => {
    const a = await planning(); await outlineService.approve(a.user.id, a.bookId, 1);
    await generationService.start(a.user.id, a.bookId);
    await a.agent.patch(`/api/v1/books/${a.bookId}`).set('Origin', ORIGIN).send({ archived: true }).expect(409);
    await a.agent.post(`/api/v1/books/${a.bookId}/duplicate`).set('Origin', ORIGIN).send({ includeManuscript: true }).expect(409);
    await generationService.cancel(a.user.id, a.bookId);
    await a.agent.delete(`/api/v1/books/${a.bookId}`).set('Origin', ORIGIN).expect(204);
    await a.agent.patch(`/api/v1/books/${a.bookId}`).set('Origin', ORIGIN).send({ archived: false }).expect(404);
  });
});
