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
  const customFonts = ['Cinzel', 'Playfair Display', 'Montserrat', 'Oswald', 'Merriweather', 'Roboto', 'Poppins', 'Bebas Neue', 'Dancing Script'];
  const fontNames = [...new Set([
    data.title.font,
    data.subtitle.font,
    data.author.font,
    ...(data.layers?.filter(l => l.type === 'text').map(l => (l as any).font) || [])
  ])];

  const localFonts = await Promise.all(
    fontNames
      .filter(name => (COVER_FONTS as readonly string[]).includes(name))
      .map(async name => `@font-face{font-family:${name};src:url(data:font/ttf;base64,${(await coverFont(name)).toString('base64')}) format('truetype');font-weight:100 900;font-display:block}`)
  );

  const googleFontsLink = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cinzel:wght@400..900&family=Dancing+Script:wght@400..700&family=Merriweather:ital,wght@0,300..900;1,300..900&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Oswald:wght@200..700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Poppins:ital,wght@0,100..900;1,100..900&family=Roboto:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">`;

  let renderedLayers = '';

  if (data.layers && data.layers.length > 0) {
    const sorted = [...data.layers].sort((a, b) => a.zIndex - b.zIndex);
    renderedLayers = sorted.filter(l => !l.hidden).map(l => {
      const left = l.x * COVER_WIDTH;
      const top = l.y * COVER_HEIGHT;
      const width = l.width * COVER_WIDTH;
      const height = l.height * COVER_HEIGHT;
      const transform = `rotate(${l.rotation}deg)`;
      const baseStyle = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;transform:${transform};transform-origin:center center;opacity:${l.opacity};box-sizing:border-box;`;

      if (l.type === 'text') {
        const textLayer = l;
        let effectCss = '';
        if (textLayer.effect === 'shadow') effectCss = 'filter:drop-shadow(0px 8px 18px rgba(0,0,0,0.85));';
        else if (textLayer.effect === 'lift') effectCss = `filter:drop-shadow(0px 0px 16px ${textLayer.effectColor || '#000000'});`;
        else if (textLayer.effect === 'outline') effectCss = `text-shadow:-2px -2px 0 ${textLayer.effectColor || '#000'}, 2px -2px 0 ${textLayer.effectColor || '#000'}, -2px 2px 0 ${textLayer.effectColor || '#000'}, 2px 2px 0 ${textLayer.effectColor || '#000'};`;
        else if (textLayer.effect === 'pill') effectCss = `background:${textLayer.effectColor || 'rgba(0,0,0,0.6)'};border-radius:9999px;padding:4px 16px;`;

        const style = `${baseStyle}font-family:'${textLayer.font}', sans-serif;font-size:${textLayer.size * COVER_WIDTH}px;font-weight:${textLayer.weight};color:${textLayer.color};text-align:${textLayer.align};direction:${textLayer.direction};line-height:${textLayer.lineHeight};letter-spacing:${textLayer.letterSpacing}px;font-style:${textLayer.italic ? 'italic' : 'normal'};text-decoration:${[textLayer.underline && 'underline', textLayer.strike && 'line-through'].filter(Boolean).join(' ') || 'none'};text-transform:${textLayer.uppercase ? 'uppercase' : 'none'};white-space:pre-wrap;overflow-wrap:anywhere;display:flex;align-items:center;justify-content:${textLayer.align === 'center' ? 'center' : textLayer.align === 'right' ? 'flex-end' : 'flex-start'};${effectCss}`;
        return `<div data-layer="${l.id}" style="${style}">${escapeHtml(textLayer.text)}</div>`;
      }

      if (l.type === 'shape') {
        const shape = l;
        let innerHtml = '';
        if (shape.shapeType === 'circle') {
          innerHtml = `<div style="width:100%;height:100%;background:${shape.fill};border:${shape.strokeWidth}px solid ${shape.stroke};border-radius:50%;"></div>`;
        } else if (shape.shapeType === 'rounded_rect' || shape.shapeType === 'rectangle') {
          innerHtml = `<div style="width:100%;height:100%;background:${shape.fill};border:${shape.strokeWidth}px solid ${shape.stroke};border-radius:${shape.borderRadius}px;"></div>`;
        } else if (shape.shapeType === 'pill') {
          innerHtml = `<div style="width:100%;height:100%;background:${shape.fill};border:${shape.strokeWidth}px solid ${shape.stroke};border-radius:9999px;"></div>`;
        } else if (shape.shapeType === 'divider') {
          innerHtml = `<div style="width:100%;height:100%;background:${shape.fill};border-radius:2px;"></div>`;
        } else if (shape.shapeType === 'triangle') {
          innerHtml = `<svg viewBox="0 0 100 100" style="width:100%;height:100%"><polygon points="50,5 95,95 5,95" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}"/></svg>`;
        } else if (shape.shapeType === 'star') {
          innerHtml = `<svg viewBox="0 0 100 100" style="width:100%;height:100%"><polygon points="50,5 63,38 98,38 69,59 80,95 50,73 20,95 31,59 2,38 37,38" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}"/></svg>`;
        } else if (shape.shapeType === 'diamond') {
          innerHtml = `<svg viewBox="0 0 100 100" style="width:100%;height:100%"><polygon points="50,5 95,50 50,95 5,50" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}"/></svg>`;
        } else {
          innerHtml = `<div style="width:100%;height:100%;background:${shape.fill};border:${shape.strokeWidth}px solid ${shape.stroke};border-radius:${shape.borderRadius}px;"></div>`;
        }
        return `<div data-layer="${l.id}" style="${baseStyle}">${innerHtml}</div>`;
      }

      if (l.type === 'icon') {
        const icon = l;
        const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="${icon.color}" stroke-width="${icon.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`;
        return `<div data-layer="${l.id}" style="${baseStyle}">${iconSvg}</div>`;
      }

      if (l.type === 'image') {
        const img = l;
        const transformWithFlip = `${transform}${img.flipX ? ' scaleX(-1)' : ''}${img.flipY ? ' scaleY(-1)' : ''}`;
        return `<div data-layer="${l.id}" style="${baseStyle}transform:${transformWithFlip};border-radius:${img.borderRadius}px;overflow:hidden;"><img src="${img.url || ''}" alt="" style="width:100%;height:100%;object-fit:${img.fit};"></div>`;
      }

      return '';
    }).join('');
  } else {
    renderedLayers = (['title', 'subtitle', 'author'] as const).map(key => {
      const text = data[key];
      const css = Object.entries(coverTextStyle(text)).map(([k, v]) => `${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}:${typeof v === 'number' && !['lineHeight'].includes(k) ? `${v}px` : v}`).join(';');
      return `<div data-layer="${key}" style="${css}">${escapeHtml(text.text)}</div>`;
    }).join('');
  }

  return `<!doctype html><html><head><meta charset="utf-8">${googleFontsLink}<style>${localFonts.join('\n')}*{box-sizing:border-box}html,body{margin:0;width:${COVER_WIDTH}px;height:${COVER_HEIGHT}px;overflow:hidden}body{position:relative;background:${data.background}}</style></head><body>${artwork ? `<img alt="" src="${artwork}" style="position:absolute;width:100%;height:100%;object-fit:cover">` : ''}<div style="position:absolute;inset:0;background:rgba(0,0,0,${data.shade})"></div>${renderedLayers}</body></html>`;
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
  async render(userId: string, bookId: string, version: number, format: 'jpeg' | 'png' | 'pdf' = 'jpeg') {
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

        if (format === 'pdf') {
          return Buffer.from(await page.pdf({ width: `${COVER_WIDTH}px`, height: `${COVER_HEIGHT}px`, printBackground: true, pageRanges: '1' }));
        }

        const buffer = Buffer.from(await page.screenshot({ type: format === 'png' ? 'png' : 'jpeg', ...(format === 'jpeg' ? { quality: 95 } : {}), fullPage: false }));
        const info = await sharp(buffer).metadata();
        if (info.width !== COVER_WIDTH || info.height !== COVER_HEIGHT) throw new Error('Invalid cover output dimensions');
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
