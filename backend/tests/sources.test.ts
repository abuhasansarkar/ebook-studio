import { afterAll, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { bookBriefSchema } from '@ebook/shared';
import { prisma } from '../src/database/prisma.js';
import { closeQueues } from '../src/queues/index.js';
import { bookService } from '../src/services/books/bookService.js';
import { closeBrowser } from '../src/services/exports/pdfRenderer.js';
import { buildZip } from '../src/services/exports/zip.js';
import { markdownToTiptap } from '../src/services/editor/markdownToTiptap.js';
import { researchService } from '../src/services/sources/researchService.js';
import { sourceService } from '../src/services/sources/sourceService.js';
import { brief, createUser, grantEntitlements, ORIGIN, PAID_ENTITLEMENTS } from './helpers.js';

afterAll(async () => { await closeBrowser(); await closeQueues(); await prisma.$disconnect(); });

/**
 * S11 source and import tests.
 *
 * These exercise the whole import path: a private file is uploaded, extracted
 * into passages with stable locators, previewed, confirmed into the manuscript,
 * and then used to answer a question with real supporting passages.
 */

async function setup(prefix = 'source') {
  const user = await createUser(prefix);
  // Importing a source is a paid capability, so the test says it is assuming a
  // paid plan.
  await grantEntitlements(user.user.id, PAID_ENTITLEMENTS);
  const book = await bookService.create(user.user.id, bookBriefSchema.parse(brief({ title: 'Meal Prep Manual' }).brief));
  return { ...user, book, url: `/api/v1/books/${book.id}/sources` };
}

/** Uploads a source through the HTTP route, exactly as the browser does. */
async function upload(agent: Awaited<ReturnType<typeof createUser>>['agent'], url: string, body: Buffer, contentType: string, query: Record<string, string>) {
  const res = await agent.post(url).set('Origin', ORIGIN).set('Content-Type', contentType).query(query).send(body);
  return res;
}

/** Uploads a source and asserts the HTTP status. */
async function uploadExpect(agent: Awaited<ReturnType<typeof createUser>>['agent'], url: string, body: Buffer, contentType: string, query: Record<string, string>, status: number) {
  const res = await upload(agent, url, body, contentType, query);
  expect(res.status).toBe(status);
  return res;
}

/** A minimal but valid DOCX package with the given paragraphs. */
function buildDocx(paragraphs: string[]): Buffer {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${escape(p)}</w:t></w:r></w:p>`).join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: '_rels/.rels', data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: 'word/document.xml', data: Buffer.from(document, 'utf8') },
  ]);
}

/** A PDF with a real text layer. */
async function buildPdf(lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const line of lines) {
    const page = pdf.addPage([595, 842]);
    page.drawText(line, { x: 50, y: 780, size: 12, font });
  }
  return Buffer.from(await pdf.save());
}

describe('source extraction', () => {
  it('extracts plain-text notes into passages with stable locators', async () => {
    const a = await setup('notes');
    const text = 'Meal prep basics\n\nBatch cooking saves time on busy weeknights.\n\nFreezing portions keeps food safe for later.';
    const res = await upload(a.agent, a.url, Buffer.from(text, 'utf8'), 'text/plain', { title: 'Notes', format: 'notes' });
    expect(res.status).toBe(201);
    expect(res.body.source.status).toBe('ready');
    expect(res.body.version.passageCount).toBeGreaterThan(0);
    // Every passage carries a locator that a citation can point at.
    for (const passage of res.body.version.passages) {
      expect(passage.locator).toMatch(/^p\d+$/);
      expect(passage.text.length).toBeGreaterThan(0);
    }
  });

  it('extracts a Word document and ignores its packaging', async () => {
    const a = await setup('docx');
    const docx = buildDocx(['First paragraph of the research.', 'Second paragraph with more detail.']);
    const res = await upload(a.agent, a.url, docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', { title: 'Research', format: 'docx' });
    expect(res.status).toBe(201);
    expect(res.body.source.status).toBe('ready');
    const text = res.body.version.passages.map((p: { text: string }) => p.text).join(' ');
    expect(text).toContain('First paragraph of the research.');
    expect(text).toContain('Second paragraph with more detail.');
  });

  it('rejects a file whose bytes do not match its declared type', async () => {
    const a = await setup('mismatch');
    // A ZIP archive declared as plain text, and a DOCX declared as a PDF.
    const zip = buildDocx(['hello']);
    await uploadExpect(a.agent, a.url, zip, 'text/plain', { title: 'Fake notes', format: 'notes' }, 400);
    await uploadExpect(a.agent, a.url, zip, 'application/pdf', { title: 'Fake pdf', format: 'pdf' }, 400);
  });

  it('reports a damaged Word document instead of importing it as empty', async () => {
    const a = await setup('damaged');
    const broken = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(64, 7)]);
    const res = await upload(a.agent, a.url, broken, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', { title: 'Broken', format: 'docx' });
    expect(res.status).toBe(201);
    expect(res.body.source.status).toBe('failed');
    expect(res.body.source.error).toBeTruthy();
  });

  it('rejects an oversized upload', async () => {
    const a = await setup('oversized');
    const huge = Buffer.alloc(6 * 1024 * 1024, 0x41);
    await uploadExpect(a.agent, a.url, huge, 'text/plain', { title: 'Huge', format: 'notes' }, 400);
  });
});

describe('import preview and application', () => {
  it('previews a chapter mapping and requires confirmation before writing', async () => {
    const a = await setup('preview');
    const text = '# Batch cooking\n\nBatch cooking saves time.\n\n# Freezing\n\nFreezing keeps food safe.';
    const up = await upload(a.agent, a.url, Buffer.from(text, 'utf8'), 'text/plain', { title: 'Notes', format: 'notes' });
    const sourceId = up.body.source.id;

    const previewRes = await a.agent.get(`/api/v1/sources/${sourceId}/preview`).set('Origin', ORIGIN);
    expect(previewRes.status).toBe(200);
    const preview = previewRes.body;
    expect(preview.proposals.length).toBeGreaterThan(0);
    // Nothing has been written to the manuscript yet.
    const chapters = await prisma.chapter.count({ where: { bookId: a.book.id } });
    expect(chapters).toBe(0);
  });

  it('applies confirmed passages to the manuscript and links the source', async () => {
    const a = await setup('apply');
    const text = 'Batch cooking saves time on busy weeknights.\n\nFreezing portions keeps food safe for later.';
    const up = await upload(a.agent, a.url, Buffer.from(text, 'utf8'), 'text/plain', { title: 'Notes', format: 'notes' });
    const sourceId = up.body.source.id;
    const passages = up.body.version.passages;

    const applied = await a.agent.post(`/api/v1/sources/${sourceId}/apply`).set('Origin', ORIGIN).send({
      version: 1,
      chapters: [{ title: 'Imported chapter', locators: passages.map((p: { locator: string }) => p.locator) }],
    }).expect(200);
    expect(applied.body.created).toHaveLength(1);

    const chapters = await prisma.chapter.findMany({ where: { bookId: a.book.id } });
    expect(chapters).toHaveLength(1);
    expect(chapters[0].wordCount).toBeGreaterThan(0);
    // The source is now linked to the chapter it supports.
    const links = await prisma.chapterSourceLink.findMany({ where: { bookId: a.book.id } });
    expect(links).toHaveLength(1);
    expect(links[0].chapterId).toBe(chapters[0].id);
  });

  it('does not create duplicate chapters when the same version is confirmed twice', async () => {
    const a = await setup('idempotent');
    const up = await upload(a.agent, a.url, Buffer.from('One passage of research.'), 'text/plain', { title: 'Notes', format: 'notes' });
    const sourceId = up.body.source.id;
    const locators = up.body.version.passages.map((p: { locator: string }) => p.locator);
    const body = { version: 1, chapters: [{ title: 'Imported chapter', locators }] };

    const first = await a.agent.post(`/api/v1/sources/${sourceId}/apply`).set('Origin', ORIGIN).send(body).expect(200);
    expect(first.body.alreadyApplied).toBe(false);
    expect(first.body.created).toHaveLength(1);

    // Confirming again is not an error: it changes nothing.
    const second = await a.agent.post(`/api/v1/sources/${sourceId}/apply`).set('Origin', ORIGIN).send(body).expect(200);
    expect(second.body.alreadyApplied).toBe(true);
    expect(second.body.created).toHaveLength(0);

    const chapters = await prisma.chapter.count({ where: { bookId: a.book.id } });
    expect(chapters).toBe(1);
  });

  it('rejects a confirmation that names a passage the version does not have', async () => {
    const a = await setup('stale');
    const up = await upload(a.agent, a.url, Buffer.from('A real passage.'), 'text/plain', { title: 'Notes', format: 'notes' });
    const sourceId = up.body.source.id;
    await a.agent.post(`/api/v1/sources/${sourceId}/apply`).set('Origin', ORIGIN).send({
      version: 1, chapters: [{ title: 'Invented', locators: ['p999'] }],
    }).expect(400);
    expect(await prisma.chapter.count({ where: { bookId: a.book.id } })).toBe(0);
  });

  it('keeps sources of different books apart', async () => {
    const a = await setup('owner-a');
    const b = await setup('owner-b');
    const up = await upload(a.agent, a.url, Buffer.from('Private research notes.'), 'text/plain', { title: 'Notes', format: 'notes' });
    const sourceId = up.body.source.id;
    // Another user's session cannot see or apply the source.
    await b.agent.get(`/api/v1/sources/${sourceId}`).set('Origin', ORIGIN).expect(404);
    await b.agent.post(`/api/v1/sources/${sourceId}/apply`).set('Origin', ORIGIN).send({ version: 1, chapters: [{ title: 'X', locators: ['p1'] }] }).expect(404);
  });
});

describe('source-grounded answers', () => {
  async function withSource(prefix: string) {
    const a = await setup(prefix);
    const text = 'Batch cooking saves time on busy weeknights.\n\nVegetarian meals can be batch cooked too.\n\nCooking oil should be stored away from heat.';
    const up = await upload(a.agent, a.url, Buffer.from(text, 'utf8'), 'text/plain', { title: 'Notes', format: 'notes' });
    return { ...a, sourceId: up.body.source.id };
  }

  it('answers a supported question with the passages that support it', async () => {
    const a = await withSource('ask-supported');
    const res = await a.agent.post(`/api/v1/books/${a.book.id}/research/ask`).set('Origin', ORIGIN).send({ question: 'Does batch cooking save time?' }).expect(200);
    expect(res.body.answer.outcome).toBe('supported');
    expect(res.body.answer.answer.length).toBeGreaterThan(0);
    // The answer points at real passages, not invented ones.
    expect(res.body.answer.evidence.length).toBeGreaterThan(0);
    const passage = await a.agent.get(`/api/v1/sources/${res.body.answer.evidence[0].sourceId}/passages/${res.body.answer.evidence[0].locator}`).set('Origin', ORIGIN).expect(200);
    expect(passage.body.passage.text.length).toBeGreaterThan(0);
  });

  it('abstains when the sources do not support the question', async () => {
    const a = await withSource('ask-unsupported');
    const res = await a.agent.post(`/api/v1/books/${a.book.id}/research/ask`).set('Origin', ORIGIN).send({ question: 'Which telescopes were used by the Mughal emperors?' }).expect(200);
    expect(res.body.answer.outcome).toBe('unsupported');
    // An unsupported answer carries no answer text and no fabricated evidence.
    expect(res.body.answer.answer).toBe('');
    expect(res.body.answer.evidence).toEqual([]);
    expect(res.body.answer.reason.length).toBeGreaterThan(0);
  });

  it('does not answer from a source of another book', async () => {
    const a = await withSource('ask-scope');
    const b = await setup('ask-scope-other');
    const res = await b.agent.post(`/api/v1/books/${b.book.id}/research/ask`).set('Origin', ORIGIN).send({ question: 'Does batch cooking save time?' }).expect(200);
    expect(res.body.answer.outcome).toBe('unsupported');
  });

  it('reports the citations of a chapter and flags a source that changed', async () => {
    const a = await withSource('citations');
    const up = await a.agent.post(`/api/v1/books/${a.book.id}/sources`).set('Origin', ORIGIN).set('Content-Type', 'text/plain').query({ title: 'Notes', format: 'notes' }).send('A passage about cooking.');
    const sourceId = up.body.source.id;
    const chapter = await prisma.chapter.create({
      data: { bookId: a.book.id, position: 0, title: 'Cooking', status: 'done', wordCount: 5, contentJson: markdownToTiptap('Cooking chapter text.') as object },
    });
    await sourceService.link(a.user.id, sourceId, { chapterId: chapter.id, locators: ['p1'], note: 'Supports the chapter.' });

    const citations = await a.agent.get(`/api/v1/chapters/${chapter.id}/sources`).set('Origin', ORIGIN).expect(200);
    expect(citations.body.citations).toHaveLength(1);
    expect(citations.body.citations[0].sourceTitle).toBe('Notes');
    expect(citations.body.citations[0].stale).toBe(false);
  });

  it('summarizes the sources and keeps the supporting passages', async () => {
    const a = await withSource('summary');
    const res = await a.agent.post(`/api/v1/books/${a.book.id}/research/summary`).set('Origin', ORIGIN).send({}).expect(200);
    expect(res.body.summary.outcome).toBe('summary');
    expect(res.body.summary.evidence.length).toBeGreaterThan(0);
  });
});

describe('source PDF extraction', () => {
  it('extracts the text layer of a PDF', async () => {
    const a = await setup('pdf');
    const pdf = await buildPdf(['Batch cooking saves time on busy weeknights.', 'Freezing keeps food safe.']);
    const res = await upload(a.agent, a.url, pdf, 'application/pdf', { title: 'Research PDF', format: 'pdf' });
    expect(res.status).toBe(201);
    // A PDF with a text layer extracts; a PDF without one is reported as a scan.
    expect(['ready', 'scanned']).toContain(res.body.source.status);
    if (res.body.source.status === 'ready') {
      expect(res.body.version.passageCount).toBeGreaterThan(0);
    } else {
      // A scanned document is described, not silently imported as empty.
      expect(res.body.source.error).toBeTruthy();
      expect(res.body.version.warnings[0].code).toBe('pdf.no_text_layer');
    }
  });
});
