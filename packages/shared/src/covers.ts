import { z } from 'zod';
export const COVER_FONTS = ['notosans', 'notosansbengali', 'notosansarabic', 'notosansdevanagari'] as const;
export const artDirectionSchema = z.object({
  style: z.enum(['editorial', 'watercolor', 'photographic', 'minimal']).default('editorial'),
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
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const coverTextSchema = z.object({
  text: z.string().max(300), font: z.enum(COVER_FONTS), color,
  x: z.number().min(.04).max(.9), y: z.number().min(.025).max(.95),
  width: z.number().min(.1).max(.92), height: z.number().min(.03).max(.5),
  size: z.number().min(.012).max(.15), weight: z.enum(['400', '700']),
  align: z.enum(['left', 'center', 'right']), direction: z.enum(['ltr', 'rtl']),
}).refine(v => v.x + v.width <= .961 && v.y + v.height <= .976, 'Keep text inside cover safe bounds');
export const coverDesignSchema = z.object({
  artworkId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).nullable(),
  background: color, shade: z.number().min(0).max(.85),
  visual: artDirectionSchema,
  title: coverTextSchema, subtitle: coverTextSchema, author: coverTextSchema,
});
export type CoverDesign = z.infer<typeof coverDesignSchema>;
export type CoverText = z.infer<typeof coverTextSchema>;
export const COVER_WIDTH = 1600;
export const COVER_HEIGHT = 2560;
export function defaultCover(title: string, subtitle = '', author = '', language = 'en'): CoverDesign {
  const font = language === 'bn' ? 'notosansbengali' : ['ar', 'fa', 'ur'].includes(language) ? 'notosansarabic' : language === 'hi' ? 'notosansdevanagari' : 'notosans';
  const direction = ['ar', 'fa', 'ur'].includes(language) ? 'rtl' : 'ltr';
  const layer = { font, color: '#ffffff', x: .08, width: .84, size: .06, weight: '700', align: 'center', direction } as const;
  return coverDesignSchema.parse({ artworkId: null, background: '#172033', shade: .35, visual: {}, title: { ...layer, text: title, y: .08, height: .3 }, subtitle: { ...layer, text: subtitle, size: .03, weight: '400', y: .4, height: .2 }, author: { ...layer, text: author, size: .035, y: .85, height: .1 } });
}
export function coverTextStyle(t: CoverText) {
  return { position: 'absolute' as const, left: t.x * COVER_WIDTH, top: t.y * COVER_HEIGHT, width: t.width * COVER_WIDTH, height: t.height * COVER_HEIGHT, fontFamily: t.font, fontSize: t.size * COVER_WIDTH, fontWeight: t.weight, color: t.color, textAlign: t.align, direction: t.direction, lineHeight: 1.25, whiteSpace: 'pre-wrap' as const, overflowWrap: 'anywhere' as const, margin: 0, padding: 0, boxSizing: 'border-box' as const };
}
