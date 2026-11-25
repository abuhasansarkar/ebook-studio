import { z } from 'zod';
export const COVER_FONTS = ['notosans', 'notosansbengali', 'notosansarabic', 'notosansdevanagari'] as const;
export const COVER_STYLES = [
  'creator_leadmagnet', 'editorial', 'watercolor', 'photographic', 'minimal',
  'minimalist', 'modern', 'business', 'corporate', 'educational', 'academic',
  'self_help', 'tech', 'finance', 'marketing', 'fiction', 'romance',
  'mystery', 'thriller', 'fantasy', 'scifi', 'children', 'storybook',
  'historical', 'biography', 'wellness', 'travel', 'cooking', 'inspirational', 'artistic',
] as const;
export const artDirectionSchema = z.object({
  style: z.string().trim().max(100).default('editorial'),
  palette: z.string().trim().max(200).default(''),
  characters: z.string().trim().max(1000).default(''),
  direction: z.string().trim().max(1000).default(''),
});
export const imageRequestSchema = z.object({
  purpose: z.enum(['cover', 'illustration']),
  prompt: z.string().trim().min(10).max(2000),
  aspect: z.enum(['portrait', 'square', 'landscape']),
  expectedCredits: z.number().int().positive(),
}).strict().refine(v => v.purpose !== 'cover' || v.aspect === 'portrait', 'Cover artwork must use portrait orientation');
export const aiCoverRequestSchema = z.object({
  style: z.string().trim().max(100).optional(),
  colorMood: z.string().trim().max(200).optional(),
  userPrompt: z.string().trim().max(1000).optional(),
  title: z.string().trim().max(200).optional(),
  subtitle: z.string().trim().max(300).optional(),
  authorName: z.string().trim().max(120).optional(),
  variations: z.boolean().default(false),
});
export type AiCoverRequest = z.infer<typeof aiCoverRequestSchema>;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const textRoleSchema = z.enum(['title', 'subtitle', 'author', 'custom']);
export const textEffectSchema = z.enum(['none', 'shadow', 'lift', 'outline', 'pill']);

export const textLayerSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.literal('text'),
  name: z.string().max(120).default('Text'),
  role: textRoleSchema.default('custom'),
  x: z.number().min(-1).max(2), // relative coordinate 0..1
  y: z.number().min(-1).max(2), // relative coordinate 0..1
  width: z.number().min(0.01).max(2),
  height: z.number().min(0.01).max(2),
  rotation: z.number().min(-360).max(360).default(0),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  zIndex: z.number().int().min(-1000).max(10000).default(0),

  text: z.string().max(2000),
  font: z.string().trim().min(1).max(80).default('notosans'),
  size: z.number().min(0.005).max(0.3), // relative to canvas width
  color: z.string().trim().min(1).max(40),
  weight: z.string().max(20).default('400'),
  italic: z.boolean().default(false),
  underline: z.boolean().default(false),
  strike: z.boolean().default(false),
  uppercase: z.boolean().default(false),
  align: z.enum(['left', 'center', 'right', 'justify']).default('center'),
  direction: z.enum(['ltr', 'rtl']).default('ltr'),
  letterSpacing: z.number().min(-50).max(200).default(0),
  lineHeight: z.number().min(0.5).max(5).default(1.25),
  effect: textEffectSchema.default('none'),
  effectColor: z.string().max(40).optional(),
});

export const shapeLayerSchema = z.object({
  id: z.string(),
  type: z.literal('shape'),
  name: z.string().default('Shape'),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  zIndex: z.number().default(0),

  shapeType: z.enum(['rectangle', 'rounded_rect', 'circle', 'triangle', 'star', 'diamond', 'badge', 'divider', 'pill']).default('rectangle'),
  fill: z.string().default('#ffffff'),
  stroke: z.string().default('transparent'),
  strokeWidth: z.number().default(0),
  borderRadius: z.number().default(0),
});

export const iconLayerSchema = z.object({
  id: z.string(),
  type: z.literal('icon'),
  name: z.string().default('Icon'),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  zIndex: z.number().default(0),

  iconName: z.string(),
  color: z.string().default('#ffffff'),
  strokeWidth: z.number().default(2),
});

export const imageLayerSchema = z.object({
  id: z.string(),
  type: z.literal('image'),
  name: z.string().default('Image'),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  zIndex: z.number().default(0),

  assetId: z.string().max(100).nullable().optional(),
  url: z
    .string()
    .max(2000)
    .refine((u) => /^(data:image\/|https?:\/\/|\/)/.test(u), "Invalid image URL")
    .optional(),
  fit: z.enum(['cover', 'contain']).default('cover'),
  borderRadius: z.number().default(0),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
});

export const designLayerSchema = z.discriminatedUnion('type', [
  textLayerSchema,
  shapeLayerSchema,
  iconLayerSchema,
  imageLayerSchema,
]);

export type DesignLayer = z.infer<typeof designLayerSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type ShapeLayer = z.infer<typeof shapeLayerSchema>;
export type IconLayer = z.infer<typeof iconLayerSchema>;
export type ImageLayer = z.infer<typeof imageLayerSchema>;

export const canvasSettingsSchema = z.object({
  width: z.number().default(1600),
  height: z.number().default(2560),
  unit: z.enum(['px', 'in', 'mm']).default('px'),
  preset: z.enum(['kindle', 'paperback_6x9', 'square', 'custom']).default('kindle'),
});
export type CanvasSettings = z.infer<typeof canvasSettingsSchema>;

export const coverTextSchema = z.object({
  text: z.string().max(300), font: z.enum(COVER_FONTS), color,
  x: z.number().min(.04).max(.9), y: z.number().min(.025).max(.95),
  width: z.number().min(.1).max(.92), height: z.number().min(.03).max(.5),
  size: z.number().min(.012).max(.15), weight: z.enum(['400', '700']),
  align: z.enum(['left', 'center', 'right']), direction: z.enum(['ltr', 'rtl']),
}).refine(v => v.x + v.width <= .961 && v.y + v.height <= .976, 'Keep text inside cover safe bounds');

export const coverDesignSchema = z.object({
  artworkId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).nullable(),
  background: color, shade: z.number().min(0).max(.95),
  visual: artDirectionSchema,
  title: coverTextSchema, subtitle: coverTextSchema, author: coverTextSchema,
  layers: z.array(designLayerSchema).optional(),
  canvas: canvasSettingsSchema.optional(),
});
export type CoverDesign = z.infer<typeof coverDesignSchema>;
export type CoverText = z.infer<typeof coverTextSchema>;
export const COVER_WIDTH = 1600;
export const COVER_HEIGHT = 2560;

export function synthesizeLayersFromLegacy(design: CoverDesign): DesignLayer[] {
  if (design.layers && design.layers.length > 0) {
    return design.layers;
  }
  const layers: DesignLayer[] = [];
  if (design.title && design.title.text) {
    layers.push({
      id: 'title',
      type: 'text',
      name: 'Book Title',
      role: 'title',
      x: design.title.x,
      y: design.title.y,
      width: design.title.width,
      height: design.title.height,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: 10,
      text: design.title.text,
      font: design.title.font,
      size: design.title.size,
      color: design.title.color,
      weight: design.title.weight,
      italic: false,
      underline: false,
      strike: false,
      uppercase: false,
      align: design.title.align,
      direction: design.title.direction,
      letterSpacing: 0,
      lineHeight: 1.2,
      effect: 'none',
    });
  }
  if (design.subtitle && design.subtitle.text) {
    layers.push({
      id: 'subtitle',
      type: 'text',
      name: 'Subtitle',
      role: 'subtitle',
      x: design.subtitle.x,
      y: design.subtitle.y,
      width: design.subtitle.width,
      height: design.subtitle.height,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: 9,
      text: design.subtitle.text,
      font: design.subtitle.font,
      size: design.subtitle.size,
      color: design.subtitle.color,
      weight: design.subtitle.weight,
      italic: false,
      underline: false,
      strike: false,
      uppercase: false,
      align: design.subtitle.align,
      direction: design.subtitle.direction,
      letterSpacing: 0,
      lineHeight: 1.25,
      effect: 'none',
    });
  }
  if (design.author && design.author.text) {
    layers.push({
      id: 'author',
      type: 'text',
      name: 'Author Name',
      role: 'author',
      x: design.author.x,
      y: design.author.y,
      width: design.author.width,
      height: design.author.height,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: 8,
      text: design.author.text,
      font: design.author.font,
      size: design.author.size,
      color: design.author.color,
      weight: design.author.weight,
      italic: false,
      underline: false,
      strike: false,
      uppercase: false,
      align: design.author.align,
      direction: design.author.direction,
      letterSpacing: 0,
      lineHeight: 1.2,
      effect: 'none',
    });
  }
  return layers;
}

export function syncLegacyFieldsFromLayers(
  layers: DesignLayer[],
  fallbackTitle: CoverText,
  fallbackSubtitle: CoverText,
  fallbackAuthor: CoverText
): { title: CoverText; subtitle: CoverText; author: CoverText } {
  const titleLayer = layers.find(l => l.type === 'text' && (l.role === 'title' || l.id === 'title')) as TextLayer | undefined;
  const subtitleLayer = layers.find(l => l.type === 'text' && (l.role === 'subtitle' || l.id === 'subtitle')) as TextLayer | undefined;
  const authorLayer = layers.find(l => l.type === 'text' && (l.role === 'author' || l.id === 'author')) as TextLayer | undefined;

  const toLegacy = (tl?: TextLayer, fb?: CoverText): CoverText => {
    if (!tl) return fb!;
    const font = (COVER_FONTS as readonly string[]).includes(tl.font) ? (tl.font as any) : 'notosans';
    const weight = tl.weight === '700' || Number(tl.weight) >= 600 ? '700' : '400';
    const align = tl.align === 'justify' ? 'center' : tl.align;
    return {
      text: tl.text.slice(0, 300),
      font,
      color: /^#[0-9a-fA-F]{6}$/.test(tl.color) ? tl.color : fb?.color || '#ffffff',
      x: Math.max(0.04, Math.min(0.9, tl.x)),
      y: Math.max(0.025, Math.min(0.95, tl.y)),
      width: Math.max(0.1, Math.min(0.92, Math.min(tl.width, 0.96 - tl.x))),
      height: Math.max(0.03, Math.min(0.5, Math.min(tl.height, 0.975 - tl.y))),
      size: Math.max(0.012, Math.min(0.15, tl.size)),
      weight,
      align,
      direction: tl.direction,
    };
  };

  return {
    title: toLegacy(titleLayer, fallbackTitle),
    subtitle: toLegacy(subtitleLayer, fallbackSubtitle),
    author: toLegacy(authorLayer, fallbackAuthor),
  };
}
export function defaultCover(title: string, subtitle = '', author = '', language = 'en'): CoverDesign {
  const font = language === 'bn' ? 'notosansbengali' : ['ar', 'fa', 'ur'].includes(language) ? 'notosansarabic' : language === 'hi' ? 'notosansdevanagari' : 'notosans';
  const direction = ['ar', 'fa', 'ur'].includes(language) ? 'rtl' : 'ltr';
  const layer = { font, color: '#ffffff', x: .08, width: .84, size: .06, weight: '700', align: 'center', direction } as const;
  return coverDesignSchema.parse({ artworkId: null, background: '#172033', shade: .35, visual: {}, title: { ...layer, text: title, y: .08, height: .3 }, subtitle: { ...layer, text: subtitle, size: .03, weight: '400', y: .4, height: .2 }, author: { ...layer, text: author, size: .035, y: .85, height: .1 } });
}
export function creatorLeadMagnetCover(title: string, subtitle = '', author = '', language = 'en'): CoverDesign {
  const font = language === 'bn' ? 'notosansbengali' : ['ar', 'fa', 'ur'].includes(language) ? 'notosansarabic' : language === 'hi' ? 'notosansdevanagari' : 'notosans';
  const direction = ['ar', 'fa', 'ur'].includes(language) ? 'rtl' : 'ltr';
  return coverDesignSchema.parse({
    artworkId: null,
    background: '#faf6f2',
    shade: 0,
    visual: { style: 'creator_leadmagnet', palette: '#ba6b4a, #faf6f2, #2b2523', characters: '', direction: 'creator editorial magazine style' },
    title: { font, color: '#2b2523', x: 0.08, y: 0.35, width: 0.58, height: 0.22, size: 0.052, weight: '700', align: 'left', direction, text: title },
    subtitle: { font, color: '#ba6b4a', x: 0.08, y: 0.58, width: 0.58, height: 0.08, size: 0.028, weight: '400', align: 'left', direction, text: subtitle },
    author: { font, color: '#332a27', x: 0.08, y: 0.12, width: 0.58, height: 0.06, size: 0.032, weight: '400', align: 'left', direction, text: author },
  });
}
export function coverTextStyle(t: CoverText) {
  return { position: 'absolute' as const, left: t.x * COVER_WIDTH, top: t.y * COVER_HEIGHT, width: t.width * COVER_WIDTH, height: t.height * COVER_HEIGHT, fontFamily: t.font, fontSize: t.size * COVER_WIDTH, fontWeight: t.weight, color: t.color, textAlign: t.align, direction: t.direction, lineHeight: 1.25, whiteSpace: 'pre-wrap' as const, overflowWrap: 'anywhere' as const, margin: 0, padding: 0, boxSizing: 'border-box' as const };
}
