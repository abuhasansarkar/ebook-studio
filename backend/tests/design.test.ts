import { afterAll, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { TEMPLATES, TRIM_SIZES, bookBriefSchema, bookDesignSchema, defaultBookDesign, designChanges, type BookDesign } from '@ebook/shared';
import { prisma } from '../src/database/prisma.js';
import { closeQueues } from '../src/queues/index.js';
import { bookService } from '../src/services/books/bookService.js';
import { designService } from '../src/services/design/designService.js';
import { fontRegistry } from '../src/services/design/fonts.js';
import { exportService } from '../src/services/exports/exportService.js';
import { closeBrowser } from '../src/services/exports/pdfRenderer.js';
import { cssString } from '../src/services/exports/bookHtml.js';
import { markdownToTiptap } from '../src/services/editor/markdownToTiptap.js';
import { brief, createUser, grantEntitlements, ORIGIN, PAID_ENTITLEMENTS } from './helpers.js';

afterAll(async () => { await closeBrowser(); await closeQueues(); await prisma.$disconnect(); });

async function setup(language = 'en', chapters = 2) {
  const user = await createUser('design');
  // Exporting is a paid capability, so the test says it is assuming a paid plan.
  await grantEntitlements(user.user.id, PAID_ENTITLEMENTS);
  const book = await bookService.create(user.user.id, bookBriefSchema.parse(brief({ language, authorName: 'Rina Das' }).brief));
  for (let i = 0; i < chapters; i++) {
    await prisma.chapter.create({ data: { bookId: book.id, position: i, title: `Chapter ${i + 1}`, status: 'done', wordCount: 20, contentJson: markdownToTiptap(`Paragraph for chapter ${i + 1}.`) as object } });
  }
  return { ...user, book, url: `/api/v1/books/${book.id}/design` };
}
const latest = (url: string, agent: Awaited<ReturnType<typeof createUser>>['agent']) => agent.get(url).expect(200).then(r => r.body.design as { version: number; data: BookDesign; action: string });

describe('book design versions', () => {
  it('gives existing books safe defaults and isolates other owners', async () => {
    const a = await setup(); const b = await setup();
    const design = await latest(a.url, a.agent);
    expect(design.version).toBe(0);
    expect(design.data.template).toEqual({ id: 'standard', version: 1 });
    expect(design.data.print.trim).toBe('6x9');
    expect(design.data.matter.copyright.text).toContain('Rina Das');
    await b.agent.get(a.url).expect(404);
    await b.agent.put(a.url).set('Origin', ORIGIN).send({ baseVersion: 0, data: design.data }).expect(404);
    await b.agent.post(`${a.url}/preview`).set('Origin', ORIGIN).send({ mode: 'reader' }).expect(404);
    await b.agent.post(`${a.url}/apply-template`).set('Origin', ORIGIN).send({ baseVersion: 0, templateId: 'classic', templateVersion: 1 }).expect(404);
  });

  it('saves immutable versions with optimistic concurrency', async () => {
    const a = await setup();
    const design = (await latest(a.url, a.agent)).data;
    design.matter.dedication = { enabled: true, text: 'For my parents' };
    const first = await a.agent.put(a.url).set('Origin', ORIGIN).send({ baseVersion: 0, data: design }).expect(200);
    expect(first.body.design.version).toBe(1);
    const stale = await a.agent.put(a.url).set('Origin', ORIGIN).send({ baseVersion: 0, data: { ...design, typography: { ...design.typography, lineHeight: 1.8 } } }).expect(409);
    expect(stale.body.error.details.latestVersion).toBe(1);
    await a.agent.put(a.url).set('Origin', ORIGIN).send({ baseVersion: 1, data: { ...design, typography: { ...design.typography, lineHeight: 1.8 } } }).expect(200);
    expect((await a.agent.get(`${a.url}?version=1`).expect(200)).body.design.data.typography.lineHeight).toBe(1.6);
    const history = (await a.agent.get(`${a.url}/versions`).expect(200)).body.versions;
    expect(history.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    await a.agent.get(`${a.url}?version=9`).expect(404);
  });

  it('applies templates as reversible snapshots without touching front and back matter', async () => {
    const a = await setup();
    const base = (await latest(a.url, a.agent)).data;
    base.matter.aboutAuthor = { enabled: true, title: 'About Rina', text: 'Rina writes about food.' };
    await a.agent.put(a.url).set('Origin', ORIGIN).send({ baseVersion: 0, data: base }).expect(200);
    const applied = await a.agent.post(`${a.url}/apply-template`).set('Origin', ORIGIN).send({ baseVersion: 1, templateId: 'classic', templateVersion: 1 }).expect(200);
    const classic = TEMPLATES.find(t => t.id === 'classic')!;
    expect(applied.body.design).toMatchObject({ version: 2, action: 'template', detail: 'classic@1' });
    expect(applied.body.design.data.print).toEqual(classic.settings.print);
    expect(applied.body.design.data.matter).toEqual(base.matter);
    expect(designChanges(base, applied.body.design.data).map(c => c.path)).toContain('print.trim');
    // Undo = restore the previous version, recorded as its own version.
    const undone = await a.agent.post(`${a.url}/restore`).set('Origin', ORIGIN).send({ baseVersion: 2, version: 1 }).expect(200);
    expect(undone.body.design).toMatchObject({ version: 3, action: 'restore', detail: '1' });
    expect(undone.body.design.data).toEqual((await a.agent.get(`${a.url}?version=1`)).body.design.data);
    await a.agent.post(`${a.url}/restore`).set('Origin', ORIGIN).send({ baseVersion: 2, version: 1 }).expect(409);
    await a.agent.post(`${a.url}/apply-template`).set('Origin', ORIGIN).send({ baseVersion: 3, templateId: 'classic', templateVersion: 99 }).expect(400);
    // Hand-editing a template-controlled setting detaches the template label but keeps the values.
    const edited = { ...applied.body.design.data, typography: { ...applied.body.design.data.typography, lineHeight: 1.9 } };
    const saved = await a.agent.put(a.url).set('Origin', ORIGIN).send({ baseVersion: 3, data: edited }).expect(200);
    expect(saved.body.design.data.template).toBeNull();
  });

  it('rejects unsafe or incomplete designs', async () => {
    const a = await setup();
    const design = (await latest(a.url, a.agent)).data;
    const put = (data: unknown) => a.agent.put(a.url).set('Origin', ORIGIN).send({ baseVersion: 0, data });
    await put({ ...design, print: { ...design.print, trim: '5x8', margins: { top: .5, bottom: .5, inside: 1.5, outside: 1.2 } } }).expect(400);
    await put({ ...design, print: { ...design.print, trim: 'letterbox' } }).expect(400);
    await put({ ...design, matter: { ...design.matter, dedication: { enabled: true, text: '  ' } } }).expect(400);
    await put({ ...design, elements: { ...design.elements, accent: 'red;}</style><script>' } }).expect(400);
    await put({ ...design, typography: { ...design.typography, font: 'Comic Sans' } }).expect(400);
    await a.agent.put(a.url).set('Origin', ORIGIN).send({ baseVersion: 0, data: design, extra: true }).expect(400);
    expect(await prisma.bookDesign.count({ where: { bookId: a.book.id } })).toBe(0);
  });
});

describe('reader and print previews', () => {
  it('keeps print-only settings out of the reflowable reader and escapes book text', async () => {
    const a = await setup();
    await prisma.book.update({ where: { id: a.book.id }, data: { title: 'Title "</style><script>alert(1)</script>' } });
    const design = TEMPLATES.find(t => t.id === 'classic')!;
    await a.agent.post(`${a.url}/apply-template`).set('Origin', ORIGIN).send({ baseVersion: 0, templateId: design.id, templateVersion: design.version }).expect(200);
    const draft = (await latest(a.url, a.agent)).data;
    draft.matter.dedication = { enabled: true, text: '<img src=x onerror=alert(1)>' };
    const reader = await a.agent.post(`${a.url}/preview`).set('Origin', ORIGIN).send({ mode: 'reader', data: draft }).expect(200);
    const html: string = reader.body.html;
    expect(html).not.toMatch(/@page|counter\(page\)|@top-center/);
    expect(html).toContain('max-width:32em');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('/api/v1/design-fonts/notoserif-regular');
    expect(reader.body.design).toEqual({ version: 1, draft: true });
    expect(reader.body.chapters).toHaveLength(2);
    expect(await prisma.bookDesign.count({ where: { bookId: a.book.id } })).toBe(1);
    expect(cssString('a"</style>\\')).toBe('"a\\22 \\3c /style\\3e \\5c "');
  });

  it('renders a real print sample with the saved trim and limits it to the first chapters', async () => {
    const a = await setup('en', 4);
    const design = (await latest(a.url, a.agent)).data;
    design.print = { ...design.print, trim: '5x8', margins: { top: .6, bottom: .6, inside: .6, outside: .5 }, header: 'title', pageNumbers: 'bottom-outside', mirrored: true };
    await a.agent.put(a.url).set('Origin', ORIGIN).send({ baseVersion: 0, data: design }).expect(200);
    const res = await a.agent.post(`${a.url}/preview`).set('Origin', ORIGIN).send({ mode: 'print', version: 1 }).buffer(true).parse((r, cb) => { const chunks: Buffer[] = []; r.on('data', (c: Buffer) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); }).expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['x-sample-chapters']).toBe('3');
    expect(res.headers['x-sample-partial']).toBe('true');
    expect(decodeURIComponent(res.headers['x-fallback-fonts'])).toBe('');
    expect(decodeURIComponent(res.headers['x-type3-fonts'])).toBe('');
    const pdf = await PDFDocument.load(res.body as Buffer);
    expect(pdf.getPageCount()).toBe(Number(res.headers['x-page-count']));
    expect(Math.round(pdf.getPage(0).getWidth())).toBe(TRIM_SIZES['5x8'].width * 72);
  });

  it('serves only manifest fonts and reports server language capabilities', async () => {
    const a = await setup();
    const font = await a.agent.get('/api/v1/design-fonts/notoserifbengali-regular').expect(200);
    expect(font.headers['content-type']).toBe('font/ttf');
    await a.agent.get('/api/v1/design-fonts/..%2Fmanifest.json').expect(400);
    await a.agent.get('/api/v1/design-fonts/notosans').expect(400);
    const caps = (await a.agent.get('/api/v1/design/capabilities').expect(200)).body;
    expect(caps.languages.find((l: { code: string }) => l.code === 'bn')).toMatchObject({ script: 'bengali', level: 'full' });
    expect(caps.fonts.every((f: { license: string }) => f.license === 'OFL-1.1')).toBe(true);
    const templates = (await a.agent.get('/api/v1/design/templates').expect(200)).body.templates;
    expect(templates.map((t: { id: string }) => t.id)).toEqual(['standard', 'classic', 'modern', 'workbook']);
  });
});

describe('design-aware exports', () => {
  it('renders the design captured at request time, not later edits', async () => {
    const a = await setup();
    const design = (await latest(a.url, a.agent)).data;
    await designService.save(a.user.id, a.book.id, 0, { ...design, print: { ...design.print, trim: '5x8', margins: { top: .6, bottom: .6, inside: .6, outside: .5 } } });
    const exp = await exportService.request(a.user.id, a.book.id, 'pdf');
    expect(exp.designVersion).toBe(1);
    await designService.save(a.user.id, a.book.id, 1, { ...design, print: { ...design.print, trim: '8.5x11' } });
    await exportService.process(exp.id);
    const done = await prisma.export.findUniqueOrThrow({ where: { id: exp.id } });
    expect(done.status).toBe('ready');
    expect(done.diagnostics).toMatchObject({ foreignFonts: [], type3Fonts: [], overflow: [] });
    const download = await a.agent.get(`/api/v1/exports/${exp.id}/download`).buffer(true).parse((r, cb) => { const chunks: Buffer[] = []; r.on('data', (c: Buffer) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); }).expect(200);
    const pdf = await PDFDocument.load(download.body as Buffer);
    expect(Math.round(pdf.getPage(0).getWidth())).toBe(5 * 72);
    expect(bookDesignSchema.parse(done.designSnapshot).print.trim).toBe('5x8');
  });

  it('refuses to export a language whose approved fonts are not installed', async () => {
    const a = await setup('ja');
    const spy = vi.spyOn(fontRegistry, 'available').mockResolvedValue(new Set(['notoserif', 'notosans', 'notosansmono']));
    try {
      await expect(exportService.request(a.user.id, a.book.id, 'pdf')).rejects.toMatchObject({ status: 409 });
      const res = await a.agent.post(`${a.url}/preview`).set('Origin', ORIGIN).send({ mode: 'print' }).expect(409);
      expect(res.body.error.message).toContain('Noto Sans JP');
      const caps = (await a.agent.get('/api/v1/design/capabilities').expect(200)).body;
      expect(caps.languages.find((l: { code: string }) => l.code === 'ja').level).toBe('unavailable');
    } finally { spy.mockRestore(); }
    expect(await prisma.export.count({ where: { bookId: a.book.id } })).toBe(0);
  });

  it('keeps defaults stable for books without a saved design', () => {
    expect(defaultBookDesign('bn', '', 2026).matter.contents.title).toBe('সূচিপত্র');
    expect(defaultBookDesign('ar', '', 2026).matter.copyright.text).toBe('© 2026');
  });
});
