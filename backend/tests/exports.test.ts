import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { bookBriefSchema, type ExportSnapshot } from '@ebook/shared';
import { prisma } from '../src/database/prisma.js';
import { closeQueues } from '../src/queues/index.js';
import { bookService } from '../src/services/books/bookService.js';
import { designService } from '../src/services/design/designService.js';
import { exportService } from '../src/services/exports/exportService.js';
import { closeBrowser } from '../src/services/exports/pdfRenderer.js';
import { readZip, zipEntry } from '../src/services/exports/zip.js';
import { markdownToTiptap } from '../src/services/editor/markdownToTiptap.js';
import { brief, createUser, grantEntitlements, ORIGIN, PAID_ENTITLEMENTS } from './helpers.js';

afterAll(async () => { await closeBrowser(); await closeQueues(); await prisma.$disconnect(); });

/**
 * S10 export tests.
 *
 * These produce real PDF, EPUB and DOCX files, store them, read them back from
 * storage and validate them. A passing test therefore proves that a download
 * serves a file that opens, not merely that a request was accepted.
 */

async function setup(options: { language?: string; chapters?: number; title?: string } = {}) {
  const language = options.language ?? 'en';
  const user = await createUser('export');
  // Exporting is a paid capability, so the test says it is assuming a paid plan.
  await grantEntitlements(user.user.id, PAID_ENTITLEMENTS);
  const book = await bookService.create(user.user.id, bookBriefSchema.parse(brief({ language, authorName: 'Rina Das', title: options.title ?? 'Meal Prep Manual' }).brief));
  for (let i = 0; i < (options.chapters ?? 2); i++) {
    const content = `Chapter ${i + 1} talks about batch cooking. Visit https://example.com for notes.`;
    await prisma.chapter.create({
      data: {
        bookId: book.id, position: i, title: `Chapter ${i + 1}`, status: 'done', wordCount: 40,
        contentJson: markdownToTiptap(content) as object,
      },
    });
  }
  return { ...user, book, url: `/api/v1/books/${book.id}/exports` };
}

/** Downloads an export and returns the raw bytes. */
async function download(agent: Awaited<ReturnType<typeof createUser>>['agent'], exportId: string) {
  const res = await agent.get(`/api/v1/exports/${exportId}/download`).buffer(true)
    .parse((r, cb) => { const chunks: Buffer[] = []; r.on('data', (c: Buffer) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); })
    .expect(200);
  return { body: res.body as Buffer, headers: res.headers };
}

describe('export snapshots', () => {
  it('captures the design and chapters at request time', async () => {
    const a = await setup();
    const design = await designService.get(a.user.id, a.book.id);
    expect(design.version).toBe(0);
    const exp = await exportService.request(a.user.id, a.book.id, 'pdf');
    expect(exp.designVersion).toBe(0);
    const snapshot = exp.snapshot as unknown as ExportSnapshot;
    expect(snapshot.format).toBe('pdf');
    expect(snapshot.chapters).toHaveLength(2);
    expect(snapshot.contentHash).toHaveLength(64);
    expect(snapshot.options).toMatchObject({ format: 'pdf', options: { layout: 'print' } });
    // The snapshot records the chapter versions that will be rendered.
    expect(snapshot.chapters.map((c) => c.version)).toEqual([0, 0]);
  });

  it('does not let a later design change alter a queued export', async () => {
    const a = await setup();
    const design = await designService.get(a.user.id, a.book.id);
    const exp = await exportService.request(a.user.id, a.book.id, 'pdf');
    // The design changes after the export was requested but before it is processed.
    await designService.save(a.user.id, a.book.id, 0, { ...design.data, print: { ...design.data.print, trim: '8.5x11' } });
    await exportService.process(exp.id);
    const done = await prisma.export.findUniqueOrThrow({ where: { id: exp.id } });
    expect(done.status).toBe('ready');
    // The export still renders the trim captured at request time.
    expect((done.designSnapshot as { print: { trim: string } }).print.trim).toBe('6x9');
    const { body } = await download(a.agent, exp.id);
    const pdf = await PDFDocument.load(body);
    expect(Math.round(pdf.getPage(0).getWidth())).toBe(6 * 72);
  });

  it('refuses a second export while one is in progress', async () => {
    const a = await setup();
    await exportService.request(a.user.id, a.book.id, 'pdf');
    await expect(exportService.request(a.user.id, a.book.id, 'epub')).rejects.toMatchObject({ status: 409 });
  });

  it('rejects options that belong to another format', async () => {
    const a = await setup();
    await a.agent.post(a.url).set('Origin', ORIGIN).send({ format: 'pdf', options: { fontScale: 1.2 } }).expect(400);
    await a.agent.post(a.url).set('Origin', ORIGIN).send({ format: 'epub', options: { layout: 'print' } }).expect(400);
    await a.agent.post(a.url).set('Origin', ORIGIN).send({ format: 'docx', options: { fontSizePt: 40 } }).expect(400);
  });

  it('isolates exports between owners', async () => {
    const a = await setup();
    const b = await setup();
    const exp = await exportService.request(a.user.id, a.book.id, 'pdf');
    await b.agent.get(`/api/v1/exports/${exp.id}/download`).expect(404);
    await b.agent.get(`/api/v1/exports/${exp.id}`).expect(404);
  });
});

describe('validated exports', () => {
  it('produces a PDF that re-opens and passes validation', async () => {
    const a = await setup();
    const exp = await exportService.request(a.user.id, a.book.id, 'pdf');
    await exportService.process(exp.id);
    const done = await prisma.export.findUniqueOrThrow({ where: { id: exp.id } });
    expect(done.status).toBe('ready');
    expect(done.error).toBeNull();
    expect(done.sha256).toHaveLength(64);
    expect(done.contentType).toBe('application/pdf');
    const validation = done.validation as { passed: boolean; validator: string; issues: unknown[] };
    expect(validation.passed).toBe(true);
    expect(validation.validator).toBe('pdf');
    expect(validation.issues).toEqual([]);
    expect(done.pageCount).toBeGreaterThan(0);

    const { body, headers } = await download(a.agent, exp.id);
    expect(headers['content-type']).toBe('application/pdf');
    expect(headers['content-disposition']).toContain('attachment');
    // The download must be the validated file: the hash of the bytes matches.
    expect(createHash('sha256').update(body).digest('hex')).toBe(done.sha256);
    const pdf = await PDFDocument.load(body);
    expect(pdf.getPageCount()).toBe(done.pageCount);
  });

  it('produces an EPUB with a valid package, navigation and spine', async () => {
    const a = await setup();
    const exp = await exportService.request(a.user.id, a.book.id, 'epub');
    await exportService.process(exp.id);
    const done = await prisma.export.findUniqueOrThrow({ where: { id: exp.id } });
    expect(done.status).toBe('ready');
    expect(done.error).toBeNull();
    expect(done.contentType).toBe('application/epub+zip');
    expect((done.validation as { passed: boolean }).passed).toBe(true);

    const { body, headers } = await download(a.agent, exp.id);
    expect(headers['content-type']).toBe('application/epub+zip');
    const entries = readZip(body);
    const names = entries.map((e) => e.name);
    // The mimetype entry must come first and be stored uncompressed.
    expect(names[0]).toBe('mimetype');
    expect(entries[0].deflated).toBe(false);
    expect(entries[0].data.toString()).toBe('application/epub+zip');
    expect(names).toContain('META-INF/container.xml');
    expect(names).toContain('OEBPS/content.opf');
    expect(names).toContain('OEBPS/nav.xhtml');
    expect(names).toContain('OEBPS/chapter-1.xhtml');
    expect(names).toContain('OEBPS/styles/book.css');

    const opf = zipEntry(entries, 'OEBPS/content.opf')!.data.toString('utf8');
    expect(opf).toContain('<dc:title>Meal Prep Manual</dc:title>');
    expect(opf).toContain('<dc:creator id="creator">Rina Das</dc:creator>');
    expect(opf).toContain('<dc:language>en</dc:language>');
    expect(opf).toContain('properties="nav"');
    // The spine lists both chapters, plus the front matter sections.
    expect((opf.match(/<itemref /g) ?? []).length).toBe(4);
    expect(opf).toContain('<itemref idref="chapter-1"/>');
    expect(opf).toContain('<itemref idref="chapter-2"/>');

    const nav = zipEntry(entries, 'OEBPS/nav.xhtml')!.data.toString('utf8');
    expect(nav).toContain('epub:type="toc"');
    expect(nav).toContain('Chapter 1');
    const chapter = zipEntry(entries, 'OEBPS/chapter-1.xhtml')!.data.toString('utf8');
    expect(chapter).toContain('batch cooking');
    expect(chapter).toContain('https://example.com');
  });

  it('produces a DOCX with the required parts, styles and relationships', async () => {
    const a = await setup();
    const exp = await exportService.request(a.user.id, a.book.id, 'docx');
    await exportService.process(exp.id);
    const done = await prisma.export.findUniqueOrThrow({ where: { id: exp.id } });
    expect(done.status).toBe('ready');
    expect(done.error).toBeNull();
    expect(done.contentType).toContain('wordprocessingml.document');
    expect((done.validation as { passed: boolean }).passed).toBe(true);

    const { body, headers } = await download(a.agent, exp.id);
    expect(headers['content-type']).toContain('wordprocessingml.document');
    const entries = readZip(body);
    const names = entries.map((e) => e.name);
    expect(names).toContain('[Content_Types].xml');
    expect(names).toContain('_rels/.rels');
    expect(names).toContain('word/document.xml');
    expect(names).toContain('word/_rels/document.xml.rels');
    expect(names).toContain('word/styles.xml');
    expect(names).toContain('word/numbering.xml');

    const document = zipEntry(entries, 'word/document.xml')!.data.toString('utf8');
    expect(document).toContain('<w:body>');
    expect(document).toContain('Meal Prep Manual');
    expect(document).toContain('batch cooking');
    // The table of contents is a field code that Word computes, not a generated list.
    expect(document).toContain('TOC \\o');

    const rels = zipEntry(entries, 'word/_rels/document.xml.rels')!.data.toString('utf8');
    expect(rels).toContain('Target="styles.xml"');
    expect(rels).toContain('TargetMode="External"');
  });

  it('fails an export whose stored file does not validate', async () => {
    const a = await setup();
    const exp = await exportService.request(a.user.id, a.book.id, 'epub');
    // The worker writes its own file, so the failure path is exercised by corrupting
    // the format the export claims to be: the validator must refuse a non-EPUB file.
    await prisma.export.update({ where: { id: exp.id }, data: { format: 'epub', contentType: 'application/epub+zip' } });
    const { storage } = await import('../src/services/storage/storage.js');
    const key = `exports/${a.user.id}/${a.book.id}/${exp.id}.epub`;
    await storage.put(key, Buffer.from('this is not an epub'), 'application/epub+zip');
    // Re-run validation against the corrupted bytes as the worker does on read-back.
    const { validateExport } = await import('../src/services/exports/validators.js');
    const { stream } = await storage.getStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const validation = await validateExport({ format: 'epub', buffer: Buffer.concat(chunks), renderFacts: {} });
    expect(validation.passed).toBe(false);
    expect(validation.issues.some((i) => i.severity === 'error')).toBe(true);
  });
});
