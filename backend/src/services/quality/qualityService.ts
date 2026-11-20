import { createHash } from 'node:crypto';
import { z } from 'zod';
import { QUALITY_RULES_VERSION, assessCitation, bookContextSchema, digestOfLocators, fontStack, imageAssetIds, locateAnchor, textAnchorSchema, textBlocks, type BookContext, type ReviewStatus } from '@ebook/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { dispatchPending, persistDispatch } from '../../queues/index.js';
import { badRequest, conflict, notFound, serviceUnavailable } from '../../utils/errors.js';
import { qualityReviewer } from '../ai/qualityReviewer.js';
import { getBrief, getOwnedBook } from '../books/bookService.js';
import { reserveInTransaction, type Tx } from '../credits/creditService.js';
import { designService } from '../design/designService.js';
import { fontRegistry, uncoveredCharacters } from '../design/fonts.js';
import { assertIdle, claimJob, fence, finishJob, finishOwned, GenerationCancelled, heartbeat, LeaseLost, lockBook } from '../generation/jobRuntime.js';
import { assertRuntimeAvailable } from '../runtime/readiness.js';
import { NOT_CHECKED, RULE_CHECKS, runRuleChecks, type FindingDraft } from './checks.js';

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const findingKey = (...parts: (string | null)[]) => createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32);

// ---------- Book context (versioned, OCC) ----------
async function latestContext(bookId: string): Promise<{ version: number; data: BookContext }> {
  const row = await prisma.bookContext.findFirst({ where: { bookId }, orderBy: { version: 'desc' } });
  if (row) return { version: row.version, data: bookContextSchema.parse(row.data) };
  const brief = await getBrief(bookId);
  return { version: 0, data: { voice: [brief.writingStyle, brief.pointOfView].filter(Boolean).join('. ').slice(0, 2000), terms: [], definitions: [], chapterSummaries: [] } };
}
export const contextService = {
  async get(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    const [context, brief] = await Promise.all([latestContext(bookId), getBrief(bookId)]);
    return { ...context, briefTerminology: brief.terminology ?? '' };
  },
  async save(userId: string, bookId: string, baseVersion: number, input: BookContext) {
    const data = bookContextSchema.parse(input);
    return prisma.$transaction(async tx => {
      await lockBook(tx, bookId, userId);
      const latest = await tx.bookContext.findFirst({ where: { bookId }, orderBy: { version: 'desc' } });
      if ((latest?.version ?? 0) !== baseVersion) throw conflict('The book context changed in another tab. Reload it before saving.', { latestVersion: latest?.version ?? 0 });
      const row = await tx.bookContext.create({ data: { bookId, version: baseVersion + 1, data } });
      return { version: row.version, data };
    });
  },
};

// ---------- Inputs and staleness ----------
/**
 * The citations of a book, with the state of the text each one rests on.
 *
 * A citation is cross-referenced rather than judged: the report says that the
 * source a chapter cites has changed or is gone, and leaves the judgement about
 * whether the chapter still agrees with it to the author.
 */
async function citationInputs(bookId: string) {
  const links = await prisma.chapterSourceLink.findMany({
    where: { bookId },
    include: {
      source: { select: { id: true, title: true, version: true, status: true, deletedAt: true } },
      chapter: { select: { id: true, position: true } },
    },
  });
  if (!links.length) return [];

  // The passages of the current extraction of each cited source, so a citation
  // can be compared against the text it now points at.
  const versions = await prisma.sourceVersion.findMany({
    where: { sourceId: { in: [...new Set(links.map((l) => l.sourceId))] }, status: 'ready' },
    orderBy: { version: 'desc' },
    select: { sourceId: true, version: true, passages: true },
  });
  const newest = new Map<string, { version: number; passages: { locator: string; text: string }[] }>();
  for (const row of versions) {
    if (newest.has(row.sourceId)) continue;
    newest.set(row.sourceId, { version: row.version, passages: (row.passages as unknown as { locator: string; text: string }[]) ?? [] });
  }

  return links.map((link) => {
    const locators = (link.locators as unknown as string[]) ?? [];
    const current = newest.get(link.sourceId);
    const passages = current?.passages ?? [];
    const assessment = assessCitation({
      linkedVersion: link.sourceVersion,
      currentVersion: current?.version ?? link.source.version,
      sourceDeleted: !!link.source.deletedAt,
      sourceStatus: link.source.status,
      locators,
      availableLocators: passages.map((p) => p.locator),
      linkedDigest: link.passageDigest,
      currentDigest: digestOfLocators(passages, locators),
    });
    return {
      chapterId: link.chapterId,
      chapterPosition: link.chapter.position,
      sourceId: link.sourceId,
      sourceTitle: link.source.title,
      locators,
      missingLocators: assessment.missingLocators,
      note: link.note,
      state: assessment.state,
      reason: assessment.reason,
      version: link.source.version,
      digest: link.passageDigest,
    };
  });
}

async function currentInputs(userId: string, bookId: string) {
  const book = await getOwnedBook(userId, bookId);
  const [brief, chapters, context, design] = await Promise.all([
    getBrief(bookId),
    prisma.chapter.findMany({ where: { bookId }, orderBy: { position: 'asc' }, select: { id: true, version: true, position: true, title: true, contentJson: true, wordCount: true, targetWords: true } }),
    latestContext(bookId),
    designService.get(userId, bookId),
  ]);
  const assetIds = [...new Set(chapters.flatMap(c => imageAssetIds(c.contentJson)))];
  const ready = assetIds.length ? await prisma.asset.findMany({ where: { id: { in: assetIds }, userId, status: 'ready' }, select: { id: true } }) : [];
  const readyAssets = ready.map(a => a.id).sort();
  const citations = await citationInputs(bookId);
  const inputs = {
    rulesVersion: QUALITY_RULES_VERSION, title: book.title, subtitle: book.subtitle, author: brief.authorName ?? '', language: book.language,
    chapters: chapters.map(c => ({ id: c.id, version: c.version })), designVersion: design.version, contextVersion: context.version, readyAssets,
    // The citations are part of the fingerprint, so a report is redone when a
    // source is deleted or re-imported and a citation stops holding.
    citations: citations.map(c => ({ chapterId: c.chapterId, sourceId: c.sourceId, state: c.state, version: c.version, digest: c.digest })),
  };
  return { book, brief, chapters, context, design, readyAssets, citations, inputs, fingerprint: sha(inputs) };
}
type Inputs = Awaited<ReturnType<typeof currentInputs>>;
function isStale(report: { kind: string; fingerprint: string; inputs: unknown }, current: Inputs) {
  if (report.kind === 'rules') return report.fingerprint !== current.fingerprint;
  const reviewed = (report.inputs as { chapters: { id: string; version: number }[]; contextVersion: number });
  const versions = new Map(current.inputs.chapters.map(c => [c.id, c.version]));
  return reviewed.contextVersion !== current.context.version || reviewed.chapters.some(c => versions.get(c.id) !== c.version);
}

function summarize(findings: Pick<FindingDraft, 'severity' | 'category' | 'needsHumanReview'>[]) {
  const counts = { error: 0, warning: 0, info: 0 };
  const byCategory: Record<string, number> = {};
  for (const f of findings) { counts[f.severity]++; byCategory[f.category] = (byCategory[f.category] ?? 0) + 1; }
  return { counts, byCategory, needsHumanReview: findings.filter(f => f.needsHumanReview).length };
}

/** Earlier dismissals of the same finding (rule + chapter + quote) carry forward; resolved findings that recur reopen. */
async function carriedDismissals(tx: Tx, bookId: string, keys: string[]) {
  if (!keys.length) return new Map<string, { reviewNote: string; reviewedById: string | null; reviewedByName: string | null; reviewedAt: Date | null }>();
  const prior = await tx.qualityFinding.findMany({ where: { key: { in: keys }, status: 'dismissed', report: { bookId } }, orderBy: { reviewedAt: 'desc' }, select: { key: true, reviewNote: true, reviewedById: true, reviewedByName: true, reviewedAt: true } });
  const map = new Map<string, (typeof prior)[number]>();
  for (const p of prior) if (!map.has(p.key)) map.set(p.key, p);
  return map;
}
function findingRow(reportId: string, f: FindingDraft, carried?: { reviewNote: string; reviewedById: string | null; reviewedByName: string | null; reviewedAt: Date | null }) {
  return {
    reportId, key: f.key, ruleId: f.ruleId, category: f.category, severity: f.severity, method: f.method, chapterId: f.chapterId,
    anchor: f.anchor ?? undefined, message: f.message.slice(0, 2000), evidence: f.evidence.slice(0, 2000), suggestion: f.suggestion ?? undefined, needsHumanReview: f.needsHumanReview,
    ...(carried ? { status: 'dismissed', reviewNote: carried.reviewNote, reviewedById: carried.reviewedById, reviewedByName: carried.reviewedByName, reviewedAt: carried.reviewedAt } : {}),
  };
}

const reportSelect = { id: true, kind: true, status: true, rulesVersion: true, fingerprint: true, inputs: true, summary: true, createdAt: true, completedAt: true, jobId: true, job: { select: { status: true, progress: true, total: true, cancelRequested: true, creditsReserved: true, creditsCharged: true, error: true, model: true } } } as const;
type ReportRow = { kind: string; status: string; fingerprint: string; inputs: unknown; job: { status: string; progress: number; total: number; cancelRequested: boolean; creditsReserved: number; creditsCharged: number; error: string | null; model: string | null } | null };
function view<T extends ReportRow>(report: T, current: Inputs) {
  const status = report.job ? report.job.status : report.status;
  return { ...report, status, stale: status === 'completed' ? isStale(report, current) : false };
}

export const qualityService = {
  /** Free deterministic report. Reuses the latest report when nothing it depends on has changed. */
  async runRules(userId: string, bookId: string) {
    const current = await currentInputs(userId, bookId);
    const existing = await prisma.qualityReport.findFirst({ where: { bookId, kind: 'rules', status: 'completed', fingerprint: current.fingerprint }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    if (existing) return { reportId: existing.id, reused: true };
    const available = await fontRegistry.available();
    const t = current.design.data.typography;
    const stack = [...new Set([...fontStack(current.book.language, t.body, available), ...fontStack(current.book.language, t.headings, available)])];
    const texts = current.chapters.flatMap(c => [c.title, ...textBlocks(c.contentJson).map(b => b.text)]);
    const uncovered = stack.length ? await uncoveredCharacters(texts, stack) : new Set<string>();
    const { findings, truncated } = runRuleChecks({
      title: current.book.title, subtitle: current.book.subtitle, author: current.inputs.author, language: current.book.language,
      chapters: current.chapters.map(c => ({ id: c.id, version: c.version, position: c.position, title: c.title, content: c.contentJson, wordCount: c.wordCount, targetWords: c.targetWords })),
      readyAssets: new Set(current.readyAssets), context: current.context.data, referencesEnabled: current.design.data.matter.references.enabled, uncoveredCharacters: uncovered,
      citations: current.citations,
    });
    const report = await prisma.$transaction(async tx => {
      await lockBook(tx, bookId, userId);
      const carried = await carriedDismissals(tx, bookId, findings.map(f => f.key));
      const created = await tx.qualityReport.create({ data: {
        bookId, userId, kind: 'rules', status: 'completed', rulesVersion: QUALITY_RULES_VERSION, fingerprint: current.fingerprint, inputs: current.inputs, completedAt: new Date(),
        summary: { ...summarize(findings), checks: RULE_CHECKS, notChecked: NOT_CHECKED, truncated, carriedDismissals: findings.filter(f => carried.has(f.key)).length },
      } });
      if (findings.length) await tx.qualityFinding.createMany({ data: findings.map(f => findingRow(created.id, f, carried.get(f.key))) });
      return created;
    }, { timeout: 30000 });
    return { reportId: report.id, reused: false };
  },

  async list(userId: string, bookId: string) {
    const current = await currentInputs(userId, bookId);
    const reports = await prisma.qualityReport.findMany({ where: { bookId }, orderBy: { createdAt: 'desc' }, take: 20, select: reportSelect });
    return { reports: reports.map(r => view(r, current)) };
  },

  /** Report detail with every anchor re-located against the current saved manuscript. */
  async get(userId: string, bookId: string, reportId: string) {
    const current = await currentInputs(userId, bookId);
    const report = await prisma.qualityReport.findFirst({ where: { id: reportId, bookId }, select: { ...reportSelect, findings: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } });
    if (!report) throw notFound('Quality report');
    const chapters = new Map(current.chapters.map(c => [c.id, { version: c.version, title: c.title, position: c.position, blocks: textBlocks(c.contentJson) }]));
    const findings = report.findings.map(f => {
      const chapter = f.chapterId ? chapters.get(f.chapterId) : undefined;
      const anchor = f.anchor ? textAnchorSchema.parse(f.anchor) : null;
      const location = anchor ? (chapter ? locateAnchor(chapter.blocks, anchor) : { status: 'missing' as const }) : null;
      return { ...f, anchor, location, chapter: chapter ? { title: chapter.title, position: chapter.position } : null, chapterRemoved: !!f.chapterId && !chapter };
    });
    return { report: { ...view(report, current), findings: undefined }, findings };
  },

  /** Anchor lookup for the editor: the finding plus its location in the saved chapter. */
  async finding(userId: string, findingId: string) {
    const finding = await prisma.qualityFinding.findFirst({ where: { id: findingId, report: { book: { userId, deletedAt: null } } }, include: { report: { select: { bookId: true, kind: true } } } });
    if (!finding) throw notFound('Finding');
    const anchor = finding.anchor ? textAnchorSchema.parse(finding.anchor) : null;
    const chapter = finding.chapterId ? await prisma.chapter.findFirst({ where: { id: finding.chapterId, bookId: finding.report.bookId }, select: { contentJson: true, version: true } }) : null;
    return { ...finding, anchor, location: anchor ? (chapter ? locateAnchor(textBlocks(chapter.contentJson), anchor) : { status: 'missing' }) : null };
  },

  async review(user: { id: string; name: string }, findingId: string, input: { status: ReviewStatus; note: string }) {
    const finding = await prisma.qualityFinding.findFirst({ where: { id: findingId, report: { book: { userId: user.id, deletedAt: null } } }, select: { id: true } });
    if (!finding) throw notFound('Finding');
    return prisma.qualityFinding.update({ where: { id: finding.id }, data: input.status === 'open'
      ? { status: 'open', reviewNote: '', reviewedById: null, reviewedByName: null, reviewedAt: null }
      : { status: input.status, reviewNote: input.note, reviewedById: user.id, reviewedByName: user.name, reviewedAt: new Date() } });
  },

  config() {
    return { creditsPerChapter: env.QUALITY_REVIEW_CREDITS, model: env.OPENAI_QUALITY_MODEL, mock: env.AI_MOCK, enabled: env.AI_MOCK || !!env.OPENAI_API_KEY };
  },
};

// ---------- Costed AI review ----------
const snapshotSchema = z.object({
  schema: z.literal(1), language: z.string(), title: z.string(), model: z.string(), creditsPerChapter: z.number().int().positive(),
  chapters: z.array(z.object({ id: z.string(), version: z.number().int() })), context: z.object({ version: z.number().int(), data: bookContextSchema }),
});
type AiSummary = { reviewed: string[]; skipped: { id: string; reason: string }[]; discarded: number; truncated: string[] };
const jobSelect = { id: true, status: true, progress: true, total: true, cancelRequested: true, creditsReserved: true, creditsCharged: true, error: true, createdAt: true } as const;

export const aiReviewService = {
  async request(userId: string, bookId: string, input: { chapterIds: string[]; expectedCredits: number }) {
    await getOwnedBook(userId, bookId); await assertRuntimeAvailable();
    if (!env.AI_MOCK && !env.OPENAI_API_KEY) throw serviceUnavailable('AI review is not configured.');
    const ids = [...new Set(input.chapterIds)];
    const chapters = await prisma.chapter.findMany({ where: { bookId, id: { in: ids }, wordCount: { gt: 0 } }, orderBy: { position: 'asc' }, select: { id: true, version: true } });
    if (chapters.length !== ids.length) throw badRequest('Choose chapters that belong to this book and have content.');
    const cost = chapters.length * env.QUALITY_REVIEW_CREDITS;
    if (input.expectedCredits !== cost) throw conflict('AI review pricing changed. Refresh the page before starting a review.', { credits: cost });
    const result = await prisma.$transaction(async tx => {
      await lockBook(tx, bookId, userId); await assertIdle(tx, bookId);
      const book = await tx.book.findUniqueOrThrow({ where: { id: bookId } });
      const context = await latestContext(bookId);
      const snapshot = { schema: 1 as const, language: book.language, title: book.title, model: env.OPENAI_QUALITY_MODEL, creditsPerChapter: env.QUALITY_REVIEW_CREDITS, chapters, context };
      const job = await tx.generationJob.create({ data: { userId, bookId, type: 'quality', total: chapters.length, creditsReserved: cost, model: env.OPENAI_QUALITY_MODEL, inputSnapshot: snapshot } });
      const report = await tx.qualityReport.create({ data: { bookId, userId, kind: 'ai', status: 'queued', rulesVersion: QUALITY_RULES_VERSION, fingerprint: sha(snapshot), jobId: job.id, inputs: { chapters, contextVersion: context.version, model: env.OPENAI_QUALITY_MODEL }, summary: { reviewed: [], skipped: [], discarded: 0, truncated: [] } } });
      await reserveInTransaction(tx, userId, cost, `job:${job.id}`);
      await persistDispatch(tx, 'quality', job.id);
      return { job: await tx.generationJob.findUniqueOrThrow({ where: { id: job.id }, select: jobSelect }), report: { id: report.id } };
    });
    await dispatchPending().catch(() => undefined);
    return result;
  },

  async cancel(userId: string, bookId: string, jobId: string) {
    await getOwnedBook(userId, bookId);
    await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM generation_jobs WHERE id = ${jobId} AND "userId" = ${userId} AND "bookId" = ${bookId} AND type = 'quality' FOR UPDATE`;
      if (!rows.length) throw notFound('AI review');
      const job = await tx.generationJob.findUniqueOrThrow({ where: { id: jobId } });
      if (!['queued', 'running'].includes(job.status)) return;
      await tx.generationJob.update({ where: { id: jobId }, data: { cancelRequested: true } });
      if (job.status === 'queued') { await finishJob(tx, jobId, 'cancelled'); await tx.qualityReport.updateMany({ where: { jobId }, data: { status: 'cancelled', completedAt: new Date() } }); }
    });
  },

  /** Worker. Each chapter commits its findings, progress and charge under the job fence, so a crash resumes after the last committed chapter. */
  async process(id: string) {
    const token = await claimJob(id); if (!token) return;
    const stop = heartbeat(id, token);
    try {
      const job = await prisma.$transaction(async tx => { const j = await fence(tx, id, token); await tx.qualityReport.updateMany({ where: { jobId: id }, data: { status: 'running' } }); return j; });
      if (job.type !== 'quality') throw new Error('Wrong quality job type');
      const snap = snapshotSchema.parse(job.inputSnapshot);
      const report = await prisma.qualityReport.findUniqueOrThrow({ where: { jobId: id } });
      const summary = report.summary as AiSummary;
      for (let i = job.progress; i < snap.chapters.length; i++) {
        const ref = snap.chapters[i];
        const chapter = await prisma.chapter.findFirst({ where: { id: ref.id, bookId: job.bookId }, select: { id: true, version: true, title: true, contentJson: true } });
        const drafts: FindingDraft[] = [];
        let reviewed = false, tokens = { input: 0, output: 0 };
        if (!chapter) summary.skipped.push({ id: ref.id, reason: 'Chapter was removed after the review was requested.' });
        else if (chapter.version !== ref.version) summary.skipped.push({ id: ref.id, reason: 'Chapter was edited after the review was requested; it was not reviewed or charged.' });
        else {
          const blocks = textBlocks(chapter.contentJson);
          const result = await qualityReviewer.review({ language: snap.language, bookTitle: snap.title, chapterTitle: chapter.title, blocks, context: snap.context.data });
          tokens = { input: result.usage.inputTokens, output: result.usage.outputTokens };
          if (result.truncated) summary.truncated.push(chapter.id);
          const seen = new Set<string>();
          for (const f of result.findings) {
            const block = blocks.find(b => b.index === f.paragraph);
            const quote = f.quote.trim();
            const start = block && quote && quote.length <= 500 ? block.text.indexOf(quote) : -1;
            // Unverifiable references are discarded rather than shown near unrelated text.
            if (!block || start < 0) { summary.discarded++; continue; }
            const key = findingKey(`ai.${f.category}`, chapter.id, quote);
            if (seen.has(key)) continue;
            seen.add(key);
            const anchor = { chapterId: chapter.id, chapterVersion: chapter.version, block: block.index, start, quote, prefix: block.text.slice(Math.max(0, start - 32), start), suffix: block.text.slice(start + quote.length, start + quote.length + 32) };
            drafts.push({ key, ruleId: `ai.${f.category}`, category: f.category, severity: f.severity, method: 'ai', chapterId: chapter.id, anchor, message: f.message.trim().slice(0, 1000) || 'AI review note.', evidence: quote, suggestion: f.suggestion.trim() ? { advice: f.suggestion.trim().slice(0, 1000) } : null, needsHumanReview: f.category === 'evidence' });
          }
          summary.reviewed.push(chapter.id);
          reviewed = true;
        }
        await prisma.$transaction(async tx => {
          await fence(tx, id, token);
          const carried = await carriedDismissals(tx, job.bookId, drafts.map(d => d.key));
          if (drafts.length) await tx.qualityFinding.createMany({ data: drafts.map(d => findingRow(report.id, d, carried.get(d.key))) });
          await tx.generationJob.update({ where: { id }, data: { progress: i + 1, creditsCharged: { increment: reviewed ? snap.creditsPerChapter : 0 }, inputTokens: { increment: tokens.input }, outputTokens: { increment: tokens.output } } });
          await tx.qualityReport.update({ where: { id: report.id }, data: { summary } });
        });
      }
      await prisma.$transaction(async tx => {
        await fence(tx, id, token);
        const findings = await tx.qualityFinding.findMany({ where: { reportId: report.id }, select: { severity: true, category: true, needsHumanReview: true } });
        await tx.qualityReport.update({ where: { id: report.id }, data: { status: 'completed', completedAt: new Date(), summary: { ...summary, ...summarize(findings as FindingDraft[]) } } });
        await finishJob(tx, id, 'completed');
      });
    } catch (err) {
      if (err instanceof LeaseLost) return;
      const cancelled = err instanceof GenerationCancelled;
      try {
        await finishOwned(id, token, cancelled ? 'cancelled' : 'failed', cancelled ? undefined : 'AI review failed. Credits for chapters that were not reviewed were returned; findings already saved are kept.');
        await prisma.qualityReport.updateMany({ where: { jobId: id }, data: { status: cancelled ? 'cancelled' : 'failed', completedAt: new Date() } });
      } catch (error) { if (!(error instanceof LeaseLost)) throw error; }
    } finally { stop(); }
  },
};
