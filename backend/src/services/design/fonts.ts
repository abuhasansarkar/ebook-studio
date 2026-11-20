import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { FONT_FACE_IDS, FONT_IDS, INTERIOR_FONTS, type FontId } from '@ebook/shared';
import { notFound } from '../../utils/errors.js';

/** Manifest-pinned interior fonts. Bytes are verified against SHA-256 before first use in a process. */
interface ManifestFont { id: string; usage: 'cover' | 'interior'; file: string; delivery: 'vendored' | 'fetched'; sha256: string; bytes: number; license: string; licenseFile: string }
const FONT_DIR = path.resolve(process.env.FONT_DIR || 'assets/fonts');
let manifestPromise: Promise<Map<string, ManifestFont>> | null = null;
function manifest() {
  manifestPromise ??= readFile(path.join(FONT_DIR, 'manifest.json'), 'utf8').then(raw => new Map((JSON.parse(raw).fonts as ManifestFont[]).map(f => [f.id, f])))
    .catch(error => { manifestPromise = null; throw error; });
  return manifestPromise;
}
const byteCache = new Map<string, Promise<Buffer>>();
const coverageCache = new Map<string, Promise<(cp: number) => boolean>>();
let availability: Promise<Set<FontId>> | null = null;

export const fontRegistry = {
  /** Families whose regular and bold faces are installed with the manifest size. Computed once per process; restart after fetching fonts. */
  available(): Promise<Set<FontId>> {
    availability ??= (async () => {
      const entries = await manifest();
      const installed = new Set<string>();
      await Promise.all(FONT_FACE_IDS.map(async id => {
        const entry = entries.get(id);
        if (!entry) throw new Error(`Font face ${id} is missing from the font manifest`);
        const info = await stat(path.join(FONT_DIR, entry.file)).catch(() => null);
        if (info?.size === entry.bytes) installed.add(id);
      }));
      return new Set(FONT_IDS.filter(id => Object.values(INTERIOR_FONTS[id].faces).every(face => installed.has(face))));
    })().catch(error => { availability = null; throw error; });
    return availability;
  },
  /** Bytes of one static face, verified against the manifest SHA-256 once per process. */
  bytes(faceId: string): Promise<Buffer> {
    if (!FONT_FACE_IDS.includes(faceId)) throw notFound('Font');
    if (!byteCache.has(faceId)) byteCache.set(faceId, (async () => {
      const entry = (await manifest()).get(faceId);
      if (!entry) throw notFound('Font');
      const bytes = await readFile(path.join(FONT_DIR, entry.file)).catch(() => { throw notFound('Font'); });
      if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`Font ${faceId} does not match its pinned SHA-256`);
      return bytes;
    })().catch(error => { byteCache.delete(faceId); throw error; }));
    return byteCache.get(faceId)!;
  },
  /** Unicode coverage of a family, read from its regular face. */
  coverage(id: FontId) {
    if (!coverageCache.has(id)) coverageCache.set(id, fontRegistry.bytes(INTERIOR_FONTS[id].faces.regular).then(cmapCoverage).catch(error => { coverageCache.delete(id); throw error; }));
    return coverageCache.get(id)!;
  },
  async families() {
    const [entries, available] = await Promise.all([manifest(), fontRegistry.available()]);
    return FONT_IDS.map(id => {
      const font = INTERIOR_FONTS[id];
      const files = Object.values(font.faces).map(face => entries.get(face)!);
      return { id, label: font.label, script: font.script, class: font.class, optional: font.optional, installed: available.has(id), styles: Object.keys(font.faces), license: files[0].license, delivery: files[0].delivery };
    });
  },
};

function tables(font: Buffer) {
  const count = font.readUInt16BE(4);
  const result = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    result.set(font.toString('latin1', at, at + 4), { offset: font.readUInt32BE(at + 8), length: font.readUInt32BE(at + 12) });
  }
  return result;
}

/** Unicode coverage from the font's cmap (formats 4 and 12), as a code point predicate. */
export function cmapCoverage(font: Buffer): (cp: number) => boolean {
  const cmap = tables(font).get('cmap');
  if (!cmap) throw new Error('Font has no cmap table');
  const base = cmap.offset;
  const subtables: { platform: number; encoding: number; offset: number; format: number }[] = [];
  for (let i = 0; i < font.readUInt16BE(base + 2); i++) {
    const at = base + 4 + i * 8;
    const offset = base + font.readUInt32BE(at + 4);
    subtables.push({ platform: font.readUInt16BE(at), encoding: font.readUInt16BE(at + 2), offset, format: font.readUInt16BE(offset) });
  }
  const ranges: [number, number][] = [];
  const full = subtables.find(s => s.format === 12 && (s.platform === 0 || (s.platform === 3 && s.encoding === 10)));
  if (full) {
    const groups = font.readUInt32BE(full.offset + 12);
    for (let i = 0; i < groups; i++) {
      const at = full.offset + 16 + i * 12;
      const start = font.readUInt32BE(at), end = font.readUInt32BE(at + 4), glyph = font.readUInt32BE(at + 8);
      ranges.push([glyph === 0 ? start + 1 : start, end]);
    }
  } else {
    const bmp = subtables.find(s => s.format === 4 && (s.platform === 0 || (s.platform === 3 && s.encoding === 1)));
    if (!bmp) throw new Error('Font has no Unicode cmap');
    const o = bmp.offset, segments = font.readUInt16BE(o + 6) / 2;
    const ends = o + 14, starts = ends + segments * 2 + 2, deltas = starts + segments * 2, rangeOffsets = deltas + segments * 2;
    for (let s = 0; s < segments; s++) {
      const start = font.readUInt16BE(starts + s * 2), end = font.readUInt16BE(ends + s * 2);
      const delta = font.readInt16BE(deltas + s * 2), rangeOffset = font.readUInt16BE(rangeOffsets + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        const glyph = rangeOffset === 0 ? (c + delta) & 0xffff : font.readUInt16BE(rangeOffsets + s * 2 + rangeOffset + (c - start) * 2);
        if (glyph !== 0) ranges.push([c, c]);
      }
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  return cp => {
    let lo = 0, hi = ranges.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cp < ranges[mid][0]) hi = mid - 1; else if (cp > ranges[mid][1]) lo = mid + 1; else return true;
    }
    return false;
  };
}

/** PostScript name (name ID 6), used to recognise bundled fonts embedded in rendered PDFs. */
export function postscriptName(font: Buffer): string {
  const name = tables(font).get('name');
  if (!name) return '';
  const count = font.readUInt16BE(name.offset + 2), strings = name.offset + font.readUInt16BE(name.offset + 4);
  for (let i = 0; i < count; i++) {
    const at = name.offset + 6 + i * 12;
    if (font.readUInt16BE(at + 6) !== 6) continue;
    const platform = font.readUInt16BE(at), length = font.readUInt16BE(at + 8), offset = strings + font.readUInt16BE(at + 10);
    const raw = font.subarray(offset, offset + length);
    return platform === 3 || platform === 0 ? Buffer.from(raw).swap16().toString('utf16le') : raw.toString('latin1');
  }
  return '';
}

// Characters that never need a glyph of their own: controls, joiners, bidi controls, variation selectors.
const IGNORED = /[\p{Cc}\p{Zs}­​-‏‪-‮⁠-⁩︀-️﻿]/u;
export type GlyphFinding = { role: 'body' | 'heading'; characters: { char: string; codepoint: string }[]; count: number };
/** Characters no approved font in the stack can draw. Rendering would otherwise use a system font or show boxes. */
export async function missingGlyphs(texts: { role: 'body' | 'heading'; text: string }[], stacks: Record<'body' | 'heading', FontId[]>): Promise<GlyphFinding[]> {
  const findings: GlyphFinding[] = [];
  for (const role of ['body', 'heading'] as const) {
    const points = new Set<number>();
    for (const t of texts) if (t.role === role) for (const ch of t.text.normalize('NFC')) if (!IGNORED.test(ch)) points.add(ch.codePointAt(0)!);
    if (!points.size) continue;
    const coverage = await Promise.all(stacks[role].map(f => fontRegistry.coverage(f)));
    const missing = [...points].filter(cp => !coverage.some(has => has(cp))).sort((a, b) => a - b);
    if (missing.length) findings.push({ role, count: missing.length, characters: missing.slice(0, 40).map(cp => ({ char: String.fromCodePoint(cp), codepoint: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}` })) });
  }
  return findings;
}

/** Every distinct character in `texts` that no font in `stack` can draw. */
export async function uncoveredCharacters(texts: string[], stack: FontId[]): Promise<Set<string>> {
  const coverage = await Promise.all(stack.map(f => fontRegistry.coverage(f)));
  const missing = new Set<string>();
  const seen = new Set<string>();
  for (const text of texts) for (const ch of text.normalize('NFC')) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    if (!IGNORED.test(ch) && !coverage.some(has => has(ch.codePointAt(0)!))) missing.add(ch);
  }
  return missing;
}
