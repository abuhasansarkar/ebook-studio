import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { COVER_FONTS, COVER_HEIGHT, COVER_WIDTH, coverDesignSchema, coverTextStyle, defaultCover, type CoverDesign } from '@ebook/shared';
import { prisma } from '../../database/prisma.js';
import { badRequest, conflict, notFound, serviceUnavailable } from '../../utils/errors.js';
import { getBrief, getOwnedBook } from '../books/bookService.js';
import { lockBook } from '../generation/jobRuntime.js';
import { assetService, pinImages } from '../assets/assetService.js';
import { getBrowser } from '../exports/pdfRenderer.js';
import { escapeHtml } from '../exports/tiptapToHtml.js';

const FONT_BASE_DIR = process.env.FONT_DIR
  ? path.resolve(process.env.FONT_DIR)
  : fileURLToPath(new URL('../../../assets/fonts', import.meta.url));

const fontCache = new Map<string, Promise<Buffer>>();
export function coverFont(name: string) {
  if (!(COVER_FONTS as readonly string[]).includes(name)) throw notFound('Font');
  if (!fontCache.has(name)) fontCache.set(name, readFile(path.resolve(FONT_BASE_DIR, `${name}.ttf`)).catch(error => { fontCache.delete(name); throw error; }));
  return fontCache.get(name)!;
}
export function artworkDocument(id: string) { return { type: 'doc', content: [{ type: 'image', attrs: { assetId: id, alt: '', caption: '' } }] }; }
export async function coverHtml(data: CoverDesign, artwork?: string) {
  const fontNames = [...new Set([data.title.font, data.subtitle.font, data.author.font])];
  const fonts = await Promise.all(fontNames.map(async name => `@font-face{font-family:${name};src:url(data:font/ttf;base64,${(await coverFont(name)).toString('base64')}) format('truetype');font-weight:100 900;font-display:block}`));
  const layers = (['title', 'subtitle', 'author'] as const).map(key => {
    const text = data[key];
    const css = Object.entries(coverTextStyle(text)).map(([k, v]) => `${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}:${typeof v === 'number' && !['lineHeight'].includes(k) ? `${v}px` : v}`).join(';');
    return `<div data-layer="${key}" style="${css}">${escapeHtml(text.text)}</div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fonts.join('\n')}*{box-sizing:border-box}html,body{margin:0;width:${COVER_WIDTH}px;height:${COVER_HEIGHT}px;overflow:hidden}body{position:relative;background:${data.background}}</style></head><body>${artwork ? `<img alt="" src="${artwork}" style="position:absolute;width:100%;height:100%;object-fit:cover">` : ''}<div style="position:absolute;inset:0;background:rgba(0,0,0,${data.shade})"></div>${layers}</body></html>`;
}
let rendering = 0;
export const coverService = {
  async get(userId: string, bookId: string, version?: number) {
    const book = await getOwnedBook(userId, bookId);
    const saved = await prisma.coverDesign.findFirst({ where: { bookId, ...(version ? { version } : {}) }, orderBy: { version: 'desc' } });
    if (version && !saved) throw notFound('Cover version');
    if (saved) return { version: saved.version, data: coverDesignSchema.parse(saved.data) };
    const brief = await getBrief(bookId);
    return { version: 0, data: defaultCover(book.title, book.subtitle, brief.authorName, book.language) };
  },
  async save(userId: string, bookId: string, baseVersion: number, input: CoverDesign) {
    const data = coverDesignSchema.parse(input);
    return prisma.$transaction(async tx => {
      await lockBook(tx, bookId, userId);
      const latest = await tx.coverDesign.findFirst({ where: { bookId }, orderBy: { version: 'desc' } });
      if ((latest?.version ?? 0) !== baseVersion) throw conflict('The cover changed in another tab. Reload the saved version or keep your draft and review before saving again.');
      if (data.artworkId) await pinImages(tx, userId, bookId, artworkDocument(data.artworkId));
      const saved = await tx.coverDesign.create({ data: { bookId, version: baseVersion + 1, data } });
      return { version: saved.version, data };
    });
  },
  async render(userId: string, bookId: string, version: number) {
    const saved = await coverService.get(userId, bookId, version);
    if (rendering >= 2) throw serviceUnavailable('Cover rendering is busy. Please retry shortly.');
    rendering++;
    try {
      let artwork: string | undefined;
      if (saved.data.artworkId) {
        const images = await assetService.exportImages(userId, [artworkDocument(saved.data.artworkId)]);
        artwork = images[saved.data.artworkId];
      }
      const html = await coverHtml(saved.data, artwork);
      const page = await (await getBrowser()).newPage();
      try {
        await page.setViewport({ width: COVER_WIDTH, height: COVER_HEIGHT, deviceScaleFactor: 1 });
        await page.setRequestInterception(true);
        page.on('request', req => { void (req.url().startsWith('data:') ? req.continue() : req.abort()); });
        await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
        await page.evaluate(() => document.fonts.ready);
        const failure = await page.evaluate(() => {
          if (Array.from(document.images).some(i => !i.complete || !i.naturalWidth)) return 'Cover artwork could not be loaded.';
          const overflow = Array.from(document.querySelectorAll<HTMLElement>('[data-layer]')).find(e => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1);
          return overflow ? `The ${overflow.dataset.layer} text does not fit. Reduce its size or enlarge its text box.` : null;
        });
        if (failure) throw badRequest(failure);
        const buffer = Buffer.from(await page.screenshot({ type: 'jpeg', quality: 95, fullPage: false }));
        const info = await sharp(buffer).metadata();
        if (info.width !== COVER_WIDTH || info.height !== COVER_HEIGHT || info.format !== 'jpeg') throw new Error('Invalid cover output');
        return buffer;
      } finally { await page.close(); }
    } finally { rendering--; }
  },
  async versions(userId: string, bookId: string) {
    await getOwnedBook(userId, bookId);
    const rows = await prisma.coverDesign.findMany({
      where: { bookId },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, data: true, createdAt: true },
    });
    return rows.map(r => {
      const d = r.data as { artworkId?: string | null; background?: string } | null;
      return {
        id: r.id,
        version: r.version,
        createdAt: r.createdAt,
        artworkId: d?.artworkId ?? null,
        background: d?.background ?? null,
      };
    });
  },
  async restore(userId: string, bookId: string, targetVersion: number) {
    await getOwnedBook(userId, bookId);
    const target = await prisma.coverDesign.findUnique({
      where: { bookId_version: { bookId, version: targetVersion } },
    });
    if (!target) throw notFound('Cover version to restore');
    const data = coverDesignSchema.parse(target.data);
    return prisma.$transaction(async tx => {
      await lockBook(tx, bookId, userId);
      const latest = await tx.coverDesign.findFirst({ where: { bookId }, orderBy: { version: 'desc' } });
      const nextVersion = (latest?.version ?? 0) + 1;
      if (data.artworkId) await pinImages(tx, userId, bookId, artworkDocument(data.artworkId));
      const saved = await tx.coverDesign.create({ data: { bookId, version: nextVersion, data } });
      return { version: saved.version, data };
    });
  },
};
