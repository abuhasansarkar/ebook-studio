import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { bookBriefSchema, locateAnchor, textBlocks } from '@ebook/shared';
import { prisma } from '../src/database/prisma.js';
import { env } from '../src/config/env.js';
import { closeQueues } from '../src/queues/index.js';
import { bookService } from '../src/services/books/bookService.js';
import { assetService } from '../src/services/assets/assetService.js';
import { chapterService } from '../src/services/editor/chapterService.js';
import { aiReviewService, qualityService } from '../src/services/quality/qualityService.js';
import { runRuleChecks } from '../src/services/quality/checks.js';
import { closeBrowser } from '../src/services/exports/pdfRenderer.js';
import { markdownToTiptap } from '../src/services/editor/markdownToTiptap.js';
import { EXPECTED, bengaliCleanInput, cleanInput, flawedInput } from './quality-fixtures.js';
import { brief, createUser, ORIGIN } from './helpers.js';

afterAll(async () => { await closeBrowser(); await closeQueues(); await prisma.$disconnect(); });

describe('deterministic checks against curated fixtures', () => {
  it('finds every injected defect at the right chapter and text, with no unexpected findings', () => {
    const input = flawedInput();
    const { findings } = runRuleChecks(input);
    const missed: string[] = [];
    for (const [ruleId, chapterId, quote] of EXPECTED) {
      const hit = findings.find(f => f.ruleId === ruleId && f.chapterId === chapterId && (quote === null || f.anchor?.quote === quote));
      if (!hit) { missed.push(`${ruleId} ${chapterId} ${quote}`); continue; }
      if (hit.anchor) {
        const chapter = input.chapters.find(c => c.id === hit.chapterId)!;
        const located = locateAnchor(textBlocks(chapter.content), hit.anchor);
        expect(located.status).toBe('current');
      }
    }
    const unexpected = findings.filter(f => !EXPECTED.some(([r, c, q]) => f.ruleId === r && f.chapterId === c && (q === null || f.anchor?.quote === q)));
    const recall = (EXPECTED.length - missed.length) / EXPECTED.length;
    const precision = (findings.length - unexpected.length) / findings.length;
    console.info(`S09 fixture evaluation: ${EXPECTED.length} injected defects, recall ${recall}, precision ${precision.toFixed(2)}, unexpected ${unexpected.map(f => f.ruleId).join(',') || 'none'}`);
    expect(missed).toEqual([]);
    expect(unexpected.map(f => `${f.ruleId} ${f.chapterId} ${f.anchor?.quote ?? ''}`)).toEqual([]);
    const term = findings.find(f => f.ruleId === 'consistency.term')!;
    expect(term.suggestion).toEqual({ replacement: 'use' });
    expect(findings.find(f => f.ruleId === 'evidence.claim')).toMatchObject({ method: 'heuristic', needsHumanReview: true });
  });

  it('reports nothing for clean English and Bengali manuscripts', () => {
    expect(runRuleChecks(cleanInput()).findings.map(f => f.ruleId)).toEqual([]);
    expect(runRuleChecks(bengaliCleanInput()).findings.map(f => f.ruleId)).toEqual([]);
  });

  it('matches avoided terms as whole words, including scripts with combining marks', () => {
    const input = bengaliCleanInput();
    input.context = { voice: '', terms: [{ preferred: 'ফ্রিজার', avoid: ['ফ্রিজ'], note: '' }, { preferred: 'use', avoid: ['utilise'], note: '' }] };
    input.chapters[0].content = markdownToTiptap('ফ্রিজ পরিষ্কার রাখুন। ফ্রিজারে খাবার রাখুন। We utilise it; utilised forms are not listed.');
    const found = runRuleChecks(input).findings.filter(f => f.ruleId === 'consistency.term');
    expect(found.map(f => [f.anchor?.quote, f.anchor?.start])).toEqual([['ফ্রিজ', 0], ['utilise', 'ফ্রিজ পরিষ্কার রাখুন। ফ্রিজারে খাবার রাখুন। We '.length]]);
  });

  it('re-locates anchors after edits and refuses to guess when the text is gone', () => {
    const before = textBlocks(markdownToTiptap('First paragraph.\n\nThe quick brown fox jumps.\n\nLast paragraph.'));
    const anchor = { chapterId: 'c', chapterVersion: 1, block: 1, start: 10, quote: 'brown fox', prefix: 'The quick ', suffix: ' jumps.' };
    expect(locateAnchor(before, anchor)).toEqual({ status: 'current', block: 1, start: 10, end: 19 });
    const moved = textBlocks(markdownToTiptap('A new opening paragraph.\n\nFirst paragraph.\n\nThe quick brown fox jumps.'));
    expect(locateAnchor(moved, anchor)).toEqual({ status: 'moved', block: 2, start: 10, end: 19 });
    const ambiguous = textBlocks(markdownToTiptap('A brown fox sleeps.\n\nThe quick brown fox jumps.'));
    // The decoy in block 0 has the quote but not the context; the original position still matches.
    expect(locateAnchor(ambiguous, anchor)).toEqual({ status: 'current', block: 1, start: 10, end: 19 });
    const reordered = textBlocks(markdownToTiptap('The quick brown fox jumps.\n\nA brown fox sleeps.'));
    expect(locateAnchor(reordered, anchor)).toEqual({ status: 'moved', block: 0, start: 10, end: 19 });
    expect(locateAnchor(textBlocks(markdownToTiptap('The quick red fox jumps.')), anchor)).toEqual({ status: 'missing' });
  });
});

async function setup() {
  const user = await createUser('quality');
  const book = await bookService.create(user.user.id, bookBriefSchema.parse(brief({ title: 'Meal Prep for Busy Parents', authorName: 'Rina Das' }).brief));
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#557799' } }).png().toBuffer();
  const asset = await assetService.upload(user.user.id, png, 'image/png');
  const ch1 = await prisma.chapter.create({ data: { bookId: book.id, position: 0, title: 'Getting started', status: 'done', targetWords: 60, wordCount: 30, contentJson: markdownToTiptap('Studies show that 73% of parents skip breakfast on weekdays.\n\nTODO: add a worked example.\n\nLabel every container with the date before freezing it.') as object } });
  const ch2 = await prisma.chapter.create({ data: { bookId: book.id, position: 1, title: 'Planning', status: 'done', targetWords: 60, wordCount: 30, contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Most families utilise the freezer far less than they could, which is a shame.' }] }, { type: 'image', attrs: { assetId: asset.id, alt: '', caption: '' } }] } } });
  return { ...user, book, ch1, ch2, base: `/api/v1/books/${book.id}/quality` };
}

describe('quality reports API', () => {
  it('creates anchored reports, reuses unchanged ones, marks stale reports and never edits the manuscript', async () => {
    const a = await setup(); const other = await setup();
    const before = await prisma.chapter.findMany({ where: { bookId: a.book.id }, orderBy: { position: 'asc' } });
    const created = await a.agent.post(`${a.base}/reports`).set('Origin', ORIGIN).send({}).expect(201);
    const again = await a.agent.post(`${a.base}/reports`).set('Origin', ORIGIN).send({}).expect(200);
    expect(again.body).toEqual({ reportId: created.body.reportId, reused: true });
    const detail = (await a.agent.get(`${a.base}/reports/${created.body.reportId}`).expect(200)).body;
    expect(detail.report).toMatchObject({ kind: 'rules', status: 'completed', stale: false });
    expect(detail.report.summary.notChecked.join(' ')).toContain('Factual accuracy is not verified');
    const rules = detail.findings.map((f: { ruleId: string }) => f.ruleId).sort();
    expect(rules).toEqual(['accessibility.alt', 'content.placeholder', 'evidence.claim']);
    const placeholder = detail.findings.find((f: { ruleId: string }) => f.ruleId === 'content.placeholder');
    expect(placeholder).toMatchObject({ chapterId: a.ch1.id, location: { status: 'current', block: 1 }, chapter: { position: 0 } });
    expect(await prisma.chapter.findMany({ where: { bookId: a.book.id }, orderBy: { position: 'asc' } })).toEqual(before);
    await other.agent.get(`${a.base}/reports/${created.body.reportId}`).expect(404);
    await other.agent.get(`/api/v1/quality/findings/${placeholder.id}`).expect(404);
    await other.agent.patch(`/api/v1/quality/findings/${placeholder.id}`).set('Origin', ORIGIN).send({ status: 'resolved' }).expect(404);

    // A normal, version-checked edit: insert a paragraph before the placeholder and fix nothing else.
    const content = (markdownToTiptap('A new opening line.\n\nStudies show that 73% of parents skip breakfast on weekdays.\n\nTODO: add a worked example.\n\nLabel every container with the date before freezing it.') as unknown as Record<string, unknown>);
    await chapterService.update(a.user.id, a.ch1.id, { version: a.ch1.version, contentJson: content });
    const stale = (await a.agent.get(`${a.base}/reports/${created.body.reportId}`).expect(200)).body;
    expect(stale.report.stale).toBe(true);
    expect(stale.findings.find((f: { id: string }) => f.id === placeholder.id).location).toMatchObject({ status: 'moved', block: 2 });
    await chapterService.update(a.user.id, a.ch1.id, { version: a.ch1.version + 1, contentJson: markdownToTiptap('Label every container with the date before freezing it.') as unknown as Record<string, unknown> });
    const lookup = (await a.agent.get(`/api/v1/quality/findings/${placeholder.id}`).expect(200)).body.finding;
    expect(lookup.location).toEqual({ status: 'missing' });
  });

  it('records attributed review decisions and carries dismissals into later reports', async () => {
    const a = await setup();
    const { reportId } = (await a.agent.post(`${a.base}/reports`).set('Origin', ORIGIN).send({}).expect(201)).body;
    const findings = (await a.agent.get(`${a.base}/reports/${reportId}`)).body.findings as { id: string; ruleId: string }[];
    const claim = findings.find(f => f.ruleId === 'evidence.claim')!;
    await a.agent.patch(`/api/v1/quality/findings/${claim.id}`).set('Origin', ORIGIN).send({ status: 'dismissed' }).expect(400);
    const dismissed = await a.agent.patch(`/api/v1/quality/findings/${claim.id}`).set('Origin', ORIGIN).send({ status: 'dismissed', note: 'Source: national survey 2024, cited in References.' }).expect(200);
    expect(dismissed.body.finding).toMatchObject({ status: 'dismissed', reviewedByName: 'quality', reviewedById: a.user.id });
    // A change elsewhere produces a new report; the same claim stays dismissed with its original note.
    await prisma.book.update({ where: { id: a.book.id }, data: { title: 'Meal Prep, Revised' } });
    const next = (await a.agent.post(`${a.base}/reports`).set('Origin', ORIGIN).send({}).expect(201)).body.reportId;
    const carried = (await a.agent.get(`${a.base}/reports/${next}`)).body;
    expect(carried.findings.find((f: { ruleId: string }) => f.ruleId === 'evidence.claim')).toMatchObject({ status: 'dismissed', reviewNote: 'Source: national survey 2024, cited in References.' });
    expect(carried.report.summary.carriedDismissals).toBe(1);
    const list = (await a.agent.get(`${a.base}/reports`)).body.reports;
    expect(list.map((r: { stale: boolean }) => r.stale)).toEqual([false, true]);
  });

  it('versions the book context and uses it for terminology checks', async () => {
    const a = await setup();
    const ctx = (await a.agent.get(`${a.base}/context`).expect(200)).body.context;
    expect(ctx.version).toBe(0);
    await a.agent.put(`${a.base}/context`).set('Origin', ORIGIN).send({ baseVersion: 0, data: { voice: 'Warm', terms: [{ preferred: 'use', avoid: ['use'], note: '' }] } }).expect(400);
    await a.agent.put(`${a.base}/context`).set('Origin', ORIGIN).send({ baseVersion: 0, data: { voice: 'Warm', terms: [{ preferred: 'use', avoid: ['utilise'], note: '' }] } }).expect(200);
    await a.agent.put(`${a.base}/context`).set('Origin', ORIGIN).send({ baseVersion: 0, data: { voice: 'Cold', terms: [] } }).expect(409);
    const { reportId } = (await a.agent.post(`${a.base}/reports`).set('Origin', ORIGIN).send({}).expect(201)).body;
    const term = (await a.agent.get(`${a.base}/reports/${reportId}`)).body.findings.find((f: { ruleId: string }) => f.ruleId === 'consistency.term');
    expect(term).toMatchObject({ chapterId: a.ch2.id, evidence: 'utilise', suggestion: { replacement: 'use' }, location: { status: 'current' } });
  });
});

describe('costed AI review', () => {
  const cost = (n: number) => n * env.QUALITY_REVIEW_CREDITS;
  it('reserves once, keeps only verifiable quotes, charges reviewed chapters and leaves the manuscript unchanged', async () => {
    const a = await setup();
    const before = await prisma.chapter.findMany({ where: { bookId: a.book.id }, orderBy: { position: 'asc' } });
    const wallet = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: a.user.id } });
    const body = { chapterIds: [a.ch1.id, a.ch2.id], expectedCredits: cost(2) };
    await a.agent.post(`${a.base}/ai-reviews`).set('Origin', ORIGIN).set('Idempotency-Key', randomUUID()).send({ ...body, expectedCredits: cost(2) + 1 }).expect(409);
    const key = randomUUID();
    const first = await a.agent.post(`${a.base}/ai-reviews`).set('Origin', ORIGIN).set('Idempotency-Key', key).send(body).expect(202);
    const replay = await a.agent.post(`${a.base}/ai-reviews`).set('Origin', ORIGIN).set('Idempotency-Key', key).send(body).expect(202);
    expect(replay.body.job.id).toBe(first.body.job.id);
    expect((await prisma.creditWallet.findUniqueOrThrow({ where: { userId: a.user.id } })).reserved).toBe(cost(2));
    // The second chapter is edited after the request: it must be skipped and not charged.
    await chapterService.update(a.user.id, a.ch2.id, { version: a.ch2.version, contentJson: markdownToTiptap('Rewritten after the request was made, so it is skipped.') as unknown as Record<string, unknown> });
    await aiReviewService.process(first.body.job.id);
    const detail = (await a.agent.get(`${a.base}/reports/${first.body.report.id}`)).body;
    expect(detail.report).toMatchObject({ kind: 'ai', status: 'completed' });
    expect(detail.report.summary.discarded).toBe(1);
    expect(detail.report.summary.skipped).toHaveLength(1);
    expect(detail.findings.length).toBeGreaterThan(0);
    for (const f of detail.findings) {
      expect(f).toMatchObject({ method: 'ai', chapterId: a.ch1.id, location: { status: 'current' } });
      expect(textBlocks(before[0].contentJson)[f.anchor.block].text).toContain(f.anchor.quote);
    }
    expect(detail.findings.find((f: { category: string }) => f.category === 'evidence')).toMatchObject({ needsHumanReview: true });
    const after = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: a.user.id } });
    expect(after.balance).toBe(wallet.balance - cost(1));
    expect(after.reserved).toBe(0);
    expect((await prisma.chapter.findUniqueOrThrow({ where: { id: a.ch1.id } })).contentJson).toEqual(before[0].contentJson);
  });

  it('refunds a cancelled queued review and rejects chapters from other books', async () => {
    const a = await setup(); const other = await setup();
    await a.agent.post(`${a.base}/ai-reviews`).set('Origin', ORIGIN).set('Idempotency-Key', randomUUID()).send({ chapterIds: [other.ch1.id], expectedCredits: cost(1) }).expect(400);
    const wallet = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: a.user.id } });
    const res = await a.agent.post(`${a.base}/ai-reviews`).set('Origin', ORIGIN).set('Idempotency-Key', randomUUID()).send({ chapterIds: [a.ch1.id], expectedCredits: cost(1) }).expect(202);
    await other.agent.post(`${other.base.replace(other.book.id, a.book.id)}/ai-reviews/${res.body.job.id}/cancel`).set('Origin', ORIGIN).send({}).expect(404);
    await a.agent.post(`${a.base}/ai-reviews/${res.body.job.id}/cancel`).set('Origin', ORIGIN).send({}).expect(204);
    await aiReviewService.process(res.body.job.id);
    const report = (await a.agent.get(`${a.base}/reports/${res.body.report.id}`)).body;
    expect(report.report.status).toBe('cancelled');
    expect(report.findings).toEqual([]);
    const after = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: a.user.id } });
    expect(after.balance).toBe(wallet.balance);
    expect(after.reserved).toBe(0);
  });
});
