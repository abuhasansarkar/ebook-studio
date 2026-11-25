import { z } from 'zod';
import { getLanguage } from './languages';

/**
 * S08 interior design contract shared by the API, worker renderer and design studio.
 * Font files are listed with hashes and licences in backend/assets/fonts/manifest.json.
 */
export const SCRIPTS = ['latin', 'bengali', 'arabic', 'urdu', 'devanagari', 'tamil', 'sc', 'jp', 'kr'] as const;
export type Script = typeof SCRIPTS[number];
export type FontClass = 'serif' | 'sans' | 'mono';
export type FaceStyle = 'regular' | 'bold' | 'italic' | 'boldItalic';
export interface InteriorFont { family: string; label: string; class: FontClass; script: Script; faces: Partial<Record<FaceStyle, string>>; optional: boolean }

const faces = (id: string, italic = false) => ({ regular: `${id}-regular`, bold: `${id}-bold`, ...(italic ? { italic: `${id}-italic`, boldItalic: `${id}-bolditalic` } : {}) });
/**
 * Interior families keyed by id. Each face is a static TrueType file listed in the font manifest: Chromium
 * embeds static faces as CID TrueType, whereas variable fonts and synthesized bold become Type 3 fonts.
 * `optional` families are fetched at install time and may be absent on a server.
 */
export const INTERIOR_FONTS = {
  notoserif: { family: 'EBS Noto Serif', label: 'Noto Serif', class: 'serif', script: 'latin', faces: faces('notoserif', true), optional: false },
  notosans: { family: 'EBS Noto Sans', label: 'Noto Sans', class: 'sans', script: 'latin', faces: faces('notosans', true), optional: false },
  notosansmono: { family: 'EBS Noto Sans Mono', label: 'Noto Sans Mono', class: 'mono', script: 'latin', faces: faces('notosansmono'), optional: false },
  notoserifbengali: { family: 'EBS Noto Serif Bengali', label: 'Noto Serif Bengali', class: 'serif', script: 'bengali', faces: faces('notoserifbengali'), optional: false },
  notosansbengali: { family: 'EBS Noto Sans Bengali', label: 'Noto Sans Bengali', class: 'sans', script: 'bengali', faces: faces('notosansbengali'), optional: false },
  notonaskharabic: { family: 'EBS Noto Naskh Arabic', label: 'Noto Naskh Arabic', class: 'serif', script: 'arabic', faces: faces('notonaskharabic'), optional: false },
  notosansarabic: { family: 'EBS Noto Sans Arabic', label: 'Noto Sans Arabic', class: 'sans', script: 'arabic', faces: faces('notosansarabic'), optional: false },
  notonastaliqurdu: { family: 'EBS Noto Nastaliq Urdu', label: 'Noto Nastaliq Urdu', class: 'serif', script: 'urdu', faces: faces('notonastaliqurdu'), optional: false },
  notoserifdevanagari: { family: 'EBS Noto Serif Devanagari', label: 'Noto Serif Devanagari', class: 'serif', script: 'devanagari', faces: faces('notoserifdevanagari'), optional: false },
  notosansdevanagari: { family: 'EBS Noto Sans Devanagari', label: 'Noto Sans Devanagari', class: 'sans', script: 'devanagari', faces: faces('notosansdevanagari'), optional: false },
  notoseriftamil: { family: 'EBS Noto Serif Tamil', label: 'Noto Serif Tamil', class: 'serif', script: 'tamil', faces: faces('notoseriftamil'), optional: false },
  notosanstamil: { family: 'EBS Noto Sans Tamil', label: 'Noto Sans Tamil', class: 'sans', script: 'tamil', faces: faces('notosanstamil'), optional: false },
  notosanssc: { family: 'EBS Noto Sans SC', label: 'Noto Sans SC', class: 'sans', script: 'sc', faces: faces('notosanssc'), optional: true },
  notosansjp: { family: 'EBS Noto Sans JP', label: 'Noto Sans JP', class: 'sans', script: 'jp', faces: faces('notosansjp'), optional: true },
  notosanskr: { family: 'EBS Noto Sans KR', label: 'Noto Sans KR', class: 'sans', script: 'kr', faces: faces('notosanskr'), optional: true },
} as const satisfies Record<string, InteriorFont>;
export type FontId = keyof typeof INTERIOR_FONTS;
export const FONT_IDS = Object.keys(INTERIOR_FONTS) as FontId[];
/** Every static face file id (the public font route only serves these). */
export const FONT_FACE_IDS: string[] = FONT_IDS.flatMap(id => Object.values(INTERIOR_FONTS[id].faces));

/** Upright text faces for each script. CJK serif families are not bundled; CJK uses sans for both. */
const SCRIPT_FACES: Record<Script, { serif: FontId; sans: FontId }> = {
  latin: { serif: 'notoserif', sans: 'notosans' },
  bengali: { serif: 'notoserifbengali', sans: 'notosansbengali' },
  arabic: { serif: 'notonaskharabic', sans: 'notosansarabic' },
  urdu: { serif: 'notonastaliqurdu', sans: 'notosansarabic' },
  devanagari: { serif: 'notoserifdevanagari', sans: 'notosansdevanagari' },
  tamil: { serif: 'notoseriftamil', sans: 'notosanstamil' },
  sc: { serif: 'notosanssc', sans: 'notosanssc' },
  jp: { serif: 'notosansjp', sans: 'notosansjp' },
  kr: { serif: 'notosanskr', sans: 'notosanskr' },
};
const LANGUAGE_SCRIPT: Record<string, Script> = { bn: 'bengali', ar: 'arabic', fa: 'arabic', ur: 'urdu', hi: 'devanagari', ta: 'tamil', zh: 'sc', ja: 'jp', ko: 'kr' };
export function languageScript(code: string): Script { return LANGUAGE_SCRIPT[getLanguage(code).code] ?? 'latin'; }

/**
 * Ordered faces for one text role: the book language's face, Latin for embedded Latin words, then
 * the other bundled scripts so mixed-script passages use approved fonts before any system fallback.
 * Han characters in non-CJK books use Simplified Chinese forms.
 */
export function fontStack(language: string, cls: 'serif' | 'sans', available?: ReadonlySet<string>): FontId[] {
  const primary = languageScript(language);
  const order: Script[] = [primary, 'latin', ...SCRIPTS.filter(s => s !== primary && s !== 'latin')];
  const faces = [...new Set(order.map(s => SCRIPT_FACES[s][cls]))];
  return available ? faces.filter(f => available.has(f)) : faces;
}
export function primaryFace(language: string, cls: 'serif' | 'sans'): FontId { return SCRIPT_FACES[languageScript(language)][cls]; }

export type SupportLevel = 'full' | 'unavailable';
/** What this server can render for a manuscript language, given the installed font files. */
export function languageSupport(code: string, available: ReadonlySet<string>) {
  const script = languageScript(code);
  const notes: string[] = [];
  const missingPrimary = (['serif', 'sans'] as const).map(c => SCRIPT_FACES[script][c]).filter(f => !available.has(f));
  if (missingPrimary.length) notes.push(`The ${[...new Set(missingPrimary)].map(f => INTERIOR_FONTS[f].label).join(', ')} font is not installed on this server.`);
  if (['sc', 'jp', 'kr'].includes(script)) notes.push('Serif text uses the bundled sans-serif CJK family.');
  if (script !== 'latin') notes.push('Italic text is slanted automatically; this script has no bundled italic.');
  if (script === 'urdu') notes.push('Nastaliq text uses a minimum line height of 2.0.');
  const level: SupportLevel = missingPrimary.length ? 'unavailable' : 'full';
  return { code, script, level, notes };
}

export const TRIM_SIZES = {
  '5x8': { label: '5 × 8 in', width: 5, height: 8 },
  '5.5x8.5': { label: '5.5 × 8.5 in', width: 5.5, height: 8.5 },
  '6x9': { label: '6 × 9 in', width: 6, height: 9 },
  '7x10': { label: '7 × 10 in', width: 7, height: 10 },
  '8.5x11': { label: '8.5 × 11 in', width: 8.5, height: 11 },
  a5: { label: 'A5 (148 × 210 mm)', width: 5.83, height: 8.27 },
  a4: { label: 'A4 (210 × 297 mm)', width: 8.27, height: 11.69 },
} as const;
export type TrimSize = keyof typeof TRIM_SIZES;
const TRIM_KEYS = Object.keys(TRIM_SIZES) as [TrimSize, ...TrimSize[]];
/** Minimum printable text block; smaller blocks make tables/images unreadable. */
export const MIN_TEXT_BLOCK = { width: 2.5, height: 4 };

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB colour');
const inches = z.number().min(.25, 'Margins must be at least 0.25 in').max(1.5, 'Margins must be at most 1.5 in');
const sectionText = (max: number) => z.string().max(max);
const titleText = z.string().trim().max(80);

export const typographySchema = z.object({
  body: z.enum(['serif', 'sans']),
  headings: z.enum(['serif', 'sans']),
  lineHeight: z.number().min(1.2).max(2.2),
  paragraph: z.enum(['indented', 'spaced']),
  align: z.enum(['start', 'justify']),
  headingScale: z.enum(['compact', 'standard', 'dramatic']),
  hyphenate: z.boolean(),
}).strict();
export const elementsSchema = z.object({
  accent: color,
  chapterLabel: z.enum(['number', 'word', 'none']),
  chapterOrnament: z.enum(['none', 'rule']),
  tableStyle: z.enum(['grid', 'lines']),
  imageWidth: z.enum(['full', 'medium']),
  captionAlign: z.enum(['center', 'start']),
}).strict();
/** Reflowable reading defaults. A reader's own font-size and width choices are never saved here. */
export const digitalProfileSchema = z.object({
  fontScale: z.number().min(.85).max(1.4),
  lineWidth: z.enum(['narrow', 'standard', 'wide']),
}).strict();
/** Fixed-page settings used only by print-layout PDFs. */
export const printProfileSchema = z.object({
  trim: z.enum(TRIM_KEYS),
  fontSizePt: z.number().min(8).max(14),
  margins: z.object({ top: inches, bottom: inches, inside: inches, outside: inches }).strict(),
  mirrored: z.boolean(),
  header: z.enum(['none', 'title', 'author-title']),
  pageNumbers: z.enum(['none', 'bottom-center', 'bottom-outside']),
}).strict().superRefine((p, ctx) => {
  const t = TRIM_SIZES[p.trim];
  if (t.width - p.margins.inside - p.margins.outside < MIN_TEXT_BLOCK.width) ctx.addIssue({ code: 'custom', path: ['margins'], message: `Inside and outside margins leave less than ${MIN_TEXT_BLOCK.width} in for text on a ${t.label} page` });
  if (t.height - p.margins.top - p.margins.bottom < MIN_TEXT_BLOCK.height) ctx.addIssue({ code: 'custom', path: ['margins'], message: `Top and bottom margins leave less than ${MIN_TEXT_BLOCK.height} in for text on a ${t.label} page` });
});
const optionalSection = (max: number) => z.object({ enabled: z.boolean(), text: sectionText(max) }).strict();
const titledSection = (max: number) => z.object({ enabled: z.boolean(), title: titleText, text: sectionText(max) }).strict();
export const matterSchema = z.object({
  titlePage: z.boolean(),
  copyright: optionalSection(3000),
  dedication: optionalSection(1000),
  contents: z.object({ enabled: z.boolean(), title: titleText }).strict(),
  aboutAuthor: titledSection(5000),
  references: titledSection(20000),
}).strict().superRefine((m, ctx) => {
  for (const key of ['copyright', 'dedication', 'aboutAuthor', 'references'] as const) {
    if (m[key].enabled && !m[key].text.trim()) ctx.addIssue({ code: 'custom', path: [key, 'text'], message: 'Add text or turn this section off' });
  }
  for (const key of ['contents', 'aboutAuthor', 'references'] as const) {
    if (m[key].enabled && !m[key].title.trim()) ctx.addIssue({ code: 'custom', path: [key, 'title'], message: 'Add a heading or turn this section off' });
  }
});

export const TEMPLATE_IDS = ['standard', 'classic', 'modern', 'workbook', 'editorial'] as const;
export type TemplateId = typeof TEMPLATE_IDS[number];
export const bookDesignSchema = z.object({
  schema: z.literal(1),
  template: z.object({ id: z.enum(TEMPLATE_IDS), version: z.number().int().positive() }).strict().nullable(),
  typography: typographySchema,
  elements: elementsSchema,
  digital: digitalProfileSchema,
  print: printProfileSchema,
  matter: matterSchema,
}).strict();
export type BookDesign = z.infer<typeof bookDesignSchema>;
export type TemplateSettings = Omit<BookDesign, 'schema' | 'template' | 'matter'>;

export interface DesignTemplate { id: TemplateId; version: number; name: string; intendedUse: string; description: string; applies: ('digital' | 'print')[]; settings: TemplateSettings }

/**
 * Versioned template definitions. Never edit a published version in place: add a new version so
 * books that applied the old one keep reproducing it (their design stores a full settings snapshot).
 */
export const TEMPLATES: readonly DesignTemplate[] = [
  {
    id: 'standard', version: 1, name: 'Standard', intendedUse: 'General non-fiction and first drafts',
    description: 'The original eBookStudio layout: serif text, spaced paragraphs and numbered chapter openings.', applies: ['digital', 'print'],
    settings: {
      typography: { body: 'serif', headings: 'serif', lineHeight: 1.6, paragraph: 'spaced', align: 'start', headingScale: 'standard', hyphenate: true },
      elements: { accent: '#e8603c', chapterLabel: 'number', chapterOrnament: 'none', tableStyle: 'grid', imageWidth: 'full', captionAlign: 'center' },
      digital: { fontScale: 1, lineWidth: 'standard' },
      print: { trim: '6x9', fontSizePt: 11, margins: { top: .8, bottom: .85, inside: .7, outside: .7 }, mirrored: false, header: 'none', pageNumbers: 'bottom-center' },
    },
  },
  {
    id: 'classic', version: 1, name: 'Classic', intendedUse: 'Novels, memoirs and narrative non-fiction',
    description: 'Book-style indented paragraphs, justified text, a chapter word and running heads on mirrored pages.', applies: ['digital', 'print'],
    settings: {
      typography: { body: 'serif', headings: 'serif', lineHeight: 1.5, paragraph: 'indented', align: 'justify', headingScale: 'dramatic', hyphenate: true },
      elements: { accent: '#5b4636', chapterLabel: 'word', chapterOrnament: 'rule', tableStyle: 'lines', imageWidth: 'medium', captionAlign: 'center' },
      digital: { fontScale: 1, lineWidth: 'narrow' },
      print: { trim: '5.5x8.5', fontSizePt: 11, margins: { top: .75, bottom: .8, inside: .8, outside: .55 }, mirrored: true, header: 'author-title', pageNumbers: 'bottom-outside' },
    },
  },
  {
    id: 'modern', version: 1, name: 'Modern', intendedUse: 'Guides, business and self-help books',
    description: 'Sans-serif headings over readable serif text, compact headings and open spacing.', applies: ['digital', 'print'],
    settings: {
      typography: { body: 'serif', headings: 'sans', lineHeight: 1.65, paragraph: 'spaced', align: 'start', headingScale: 'standard', hyphenate: false },
      elements: { accent: '#1f6f8b', chapterLabel: 'word', chapterOrnament: 'none', tableStyle: 'lines', imageWidth: 'full', captionAlign: 'start' },
      digital: { fontScale: 1, lineWidth: 'standard' },
      print: { trim: '6x9', fontSizePt: 10.5, margins: { top: .75, bottom: .85, inside: .75, outside: .6 }, mirrored: true, header: 'title', pageNumbers: 'bottom-outside' },
    },
  },
  {
    id: 'workbook', version: 1, name: 'Workbook', intendedUse: 'Workbooks, manuals, recipes and reference material',
    description: 'Large page, sans-serif text, gridded tables and full-width images for scanning and note-taking.', applies: ['digital', 'print'],
    settings: {
      typography: { body: 'sans', headings: 'sans', lineHeight: 1.55, paragraph: 'spaced', align: 'start', headingScale: 'compact', hyphenate: false },
      elements: { accent: '#2f7d4a', chapterLabel: 'number', chapterOrnament: 'rule', tableStyle: 'grid', imageWidth: 'full', captionAlign: 'start' },
      digital: { fontScale: 1.05, lineWidth: 'wide' },
      print: { trim: '8.5x11', fontSizePt: 11, margins: { top: .75, bottom: .8, inside: .85, outside: .65 }, mirrored: true, header: 'title', pageNumbers: 'bottom-outside' },
    },
  },
  {
    id: 'editorial', version: 1, name: 'Editorial Magazine', intendedUse: 'Creator lead-magnets, lifestyle guides, workbooks and digital magazines',
    description: 'Modern editorial aesthetic: warm terracotta accents, high-contrast serif headings, clean sans-serif body, bento cards and concrete example callouts.', applies: ['digital', 'print'],
    settings: {
      typography: { body: 'sans', headings: 'serif', lineHeight: 1.65, paragraph: 'spaced', align: 'start', headingScale: 'dramatic', hyphenate: false },
      elements: { accent: '#ba6b4a', chapterLabel: 'number', chapterOrnament: 'rule', tableStyle: 'lines', imageWidth: 'full', captionAlign: 'start' },
      digital: { fontScale: 1.05, lineWidth: 'standard' },
      print: { trim: '8.5x11', fontSizePt: 11, margins: { top: .7, bottom: .7, inside: .7, outside: .7 }, mirrored: false, header: 'none', pageNumbers: 'bottom-center' },
    },
  },
];
export function findTemplate(id: string, version?: number) {
  return TEMPLATES.find(t => t.id === id && (version === undefined || t.version === version));
}

const LABELS: Record<string, { contents: string; chapter: string }> = {
  en: { contents: 'Contents', chapter: 'Chapter' }, zh: { contents: '目录', chapter: '第{n}章' }, hi: { contents: 'विषय-सूची', chapter: 'अध्याय' },
  es: { contents: 'Contenido', chapter: 'Capítulo' }, ar: { contents: 'المحتويات', chapter: 'الفصل' }, fr: { contents: 'Table des matières', chapter: 'Chapitre' },
  bn: { contents: 'সূচিপত্র', chapter: 'অধ্যায়' }, pt: { contents: 'Sumário', chapter: 'Capítulo' }, ru: { contents: 'Содержание', chapter: 'Глава' },
  ur: { contents: 'فہرست', chapter: 'باب' }, id: { contents: 'Daftar Isi', chapter: 'Bab' }, de: { contents: 'Inhalt', chapter: 'Kapitel' },
  ja: { contents: '目次', chapter: '第{n}章' }, tr: { contents: 'İçindekiler', chapter: 'Bölüm' }, ko: { contents: '목차', chapter: '제{n}장' },
  vi: { contents: 'Mục lục', chapter: 'Chương' }, it: { contents: 'Indice', chapter: 'Capitolo' }, ta: { contents: 'பொருளடக்கம்', chapter: 'அத்தியாயம்' },
  fa: { contents: 'فهرست مطالب', chapter: 'فصل' }, sw: { contents: 'Yaliyomo', chapter: 'Sura' },
};
export function contentsLabel(language: string) { return (LABELS[language] ?? LABELS.en).contents; }
/** "Chapter 3", or a language pattern such as 第3章. Numbers stay as Western digits. */
export function chapterWord(language: string, n: number) {
  const word = (LABELS[language] ?? LABELS.en).chapter;
  return word.includes('{n}') ? word.replace('{n}', String(n)) : `${word} ${n}`;
}

export function applyTemplate(design: BookDesign, template: DesignTemplate): BookDesign {
  return bookDesignSchema.parse({ ...design, ...structuredClone(template.settings), template: { id: template.id, version: template.version } });
}
/** Safe defaults for books without a saved design; matches the layout exports used before S08. */
export function defaultBookDesign(language: string, authorName = '', year = new Date().getUTCFullYear(), templateId: TemplateId = 'standard'): BookDesign {
  const holder = authorName.trim();
  const copyright = language === 'en' ? `© ${year}${holder ? ` ${holder}` : ''}. All rights reserved. No part of this publication may be reproduced without permission, except for brief quotations in reviews.` : `© ${year}${holder ? ` ${holder}` : ''}`;
  const base = {
    schema: 1 as const, template: null,
    matter: {
      titlePage: true, copyright: { enabled: true, text: copyright }, dedication: { enabled: false, text: '' },
      contents: { enabled: true, title: contentsLabel(language) },
      aboutAuthor: { enabled: false, title: 'About the author', text: '' }, references: { enabled: false, title: 'References', text: '' },
    },
  };
  const chosenTemplate = findTemplate(templateId) ?? TEMPLATES[0];
  return applyTemplate({ ...base, ...chosenTemplate.settings } as BookDesign, chosenTemplate);
}

const SETTING_LABELS: Record<string, string> = {
  'typography.body': 'Body font', 'typography.headings': 'Heading font', 'typography.lineHeight': 'Line height', 'typography.paragraph': 'Paragraph style',
  'typography.align': 'Text alignment', 'typography.headingScale': 'Heading size', 'typography.hyphenate': 'Hyphenation',
  'elements.accent': 'Accent colour', 'elements.chapterLabel': 'Chapter label', 'elements.chapterOrnament': 'Chapter ornament', 'elements.tableStyle': 'Table style',
  'elements.imageWidth': 'Image width', 'elements.captionAlign': 'Caption alignment', 'digital.fontScale': 'Reader text size', 'digital.lineWidth': 'Reader line width',
  'print.trim': 'Trim size', 'print.fontSizePt': 'Print text size', 'print.margins.top': 'Top margin', 'print.margins.bottom': 'Bottom margin',
  'print.margins.inside': 'Inside margin', 'print.margins.outside': 'Outside margin', 'print.mirrored': 'Mirrored margins', 'print.header': 'Running head', 'print.pageNumbers': 'Page numbers',
};
export interface DesignChange { path: string; label: string; scope: 'shared' | 'digital' | 'print'; from: unknown; to: unknown }
/** Template-controlled settings that differ; matter is never template-controlled. */
export function designChanges(from: BookDesign, to: BookDesign): DesignChange[] {
  const changes: DesignChange[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of Object.keys(b)) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`); return; }
    if (a !== b) changes.push({ path, label: SETTING_LABELS[path] ?? path, scope: path.startsWith('print') ? 'print' : path.startsWith('digital') ? 'digital' : 'shared', from: a, to: b });
  };
  for (const key of ['typography', 'elements', 'digital', 'print'] as const) walk(from[key], to[key], key);
  return changes;
}
