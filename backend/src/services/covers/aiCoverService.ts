import { randomUUID, createHash } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import {
  COVER_FONTS,
  COVER_WIDTH,
  COVER_HEIGHT,
  coverDesignSchema,
  type CoverDesign,
  type AiCoverRequest,
  type CoverText,
} from '@ebook/shared';
import { prisma } from '../../database/prisma.js';
import { env } from '../../config/env.js';
import { serviceUnavailable, badRequest } from '../../utils/errors.js';
import { getOwnedBook, getBrief } from '../books/bookService.js';
import { lockBook } from '../generation/jobRuntime.js';
import { sanitizeImage } from '../assets/assetService.js';
import { storage } from '../storage/storage.js';
import { imageProvider } from './imageProvider.js';
import { openaiProvider } from '../ai/openaiClient.js';
import { reserveInTransaction, settleInTransaction } from '../credits/creditService.js';
import { artworkDocument } from './coverService.js';
import { pinImages } from '../assets/assetService.js';

export const aiCoverPlanSchema = z.object({
  genre: z.string(),
  visualConcept: z.string(),
  imagePrompt: z.string(),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  shade: z.number().min(0.05).max(0.65),
  titleFont: z.enum(COVER_FONTS),
  titleColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  titleSize: z.number().min(0.04).max(0.12),
  titleY: z.number().min(0.04).max(0.35),
  titleHeight: z.number().min(0.1).max(0.4),
  titleAlign: z.enum(['center', 'left', 'right']).default('center'),
  subtitleFont: z.enum(COVER_FONTS),
  subtitleColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  subtitleSize: z.number().min(0.02).max(0.06),
  subtitleY: z.number().min(0.35).max(0.65),
  subtitleHeight: z.number().min(0.05).max(0.25),
  subtitleAlign: z.enum(['center', 'left', 'right']).default('center'),
  authorFont: z.enum(COVER_FONTS),
  authorColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  authorSize: z.number().min(0.025).max(0.06),
  authorY: z.number().min(0.75).max(0.92),
  authorHeight: z.number().min(0.04).max(0.12),
  authorAlign: z.enum(['center', 'left', 'right']).default('center'),
});

export type AiCoverPlan = z.infer<typeof aiCoverPlanSchema>;

const GENRE_PALETTES: Record<string, { bg: string; text: string; shade: number }> = {
  business: { bg: '#0b192c', text: '#f1f5f9', shade: 0.35 },
  marketing: { bg: '#1a102f', text: '#ffd166', shade: 0.3 },
  tech: { bg: '#090d16', text: '#38bdf8', shade: 0.25 },
  finance: { bg: '#062016', text: '#4ade80', shade: 0.35 },
  fiction: { bg: '#1c1917', text: '#fafaf9', shade: 0.3 },
  fantasy: { bg: '#1e112a', text: '#e9d5ff', shade: 0.35 },
  scifi: { bg: '#050c1a', text: '#67e8f9', shade: 0.25 },
  mystery: { bg: '#111827', text: '#f3f4f6', shade: 0.4 },
  romance: { bg: '#2b0f19', text: '#fecdd3', shade: 0.25 },
  children: { bg: '#1e3a5f', text: '#fef08a', shade: 0.2 },
  wellness: { bg: '#132a22', text: '#d1fae5', shade: 0.25 },
  minimalist: { bg: '#18181b', text: '#ffffff', shade: 0.3 },
  modern: { bg: '#0f172a', text: '#f8fafc', shade: 0.3 },
};

function selectFallbackPlan(topic: string, style?: string): AiCoverPlan {
  const normalized = (style || topic || 'modern').toLowerCase();
  let key = 'modern';
  for (const k of Object.keys(GENRE_PALETTES)) {
    if (normalized.includes(k)) {
      key = k;
      break;
    }
  }
  const palette = GENRE_PALETTES[key] || GENRE_PALETTES.modern;

  return {
    genre: key,
    visualConcept: `Professional commercial book cover artwork representing ${topic || 'the book subject'}, with clean compositional balance and rich atmosphere.`,
    imagePrompt: `High-end commercial book cover artwork representing ${topic || 'modern themes'}, visual atmosphere, dynamic lighting, cinematic depth. Artwork only, zero text, zero letters, zero watermarks, generous negative space at top and bottom for typography overlay.`,
    backgroundColor: palette.bg,
    shade: palette.shade,
    titleFont: 'notosans',
    titleColor: palette.text,
    titleSize: 0.07,
    titleY: 0.08,
    titleHeight: 0.28,
    titleAlign: 'center',
    subtitleFont: 'notosans',
    subtitleColor: '#cbd5e1',
    subtitleSize: 0.032,
    subtitleY: 0.38,
    subtitleHeight: 0.16,
    subtitleAlign: 'center',
    authorFont: 'notosans',
    authorColor: '#94a3b8',
    authorSize: 0.035,
    authorY: 0.86,
    authorHeight: 0.08,
    authorAlign: 'center',
  };
}

export const aiCoverService = {
  async plan(userId: string, bookId: string, input: AiCoverRequest): Promise<AiCoverPlan> {
    const book = await getOwnedBook(userId, bookId);
    const brief = await getBrief(bookId).catch(() => null);

    const title = input.title || book.title || 'Untitled Book';
    const subtitle = input.subtitle !== undefined ? input.subtitle : book.subtitle || '';
    const authorName = input.authorName || brief?.authorName || '';
    const topic = brief?.topic || book.title;
    const targetAudience = brief?.targetAudience || 'General readers';
    const description = [brief?.readerProblem, brief?.readerOutcome, brief?.purpose].filter(Boolean).join('. ') || topic;
    const bookType = book.bookType;
    const language = book.language;

    if (env.AI_MOCK || !env.OPENAI_API_KEY) {
      return selectFallbackPlan(topic, input.style);
    }

    const systemPrompt = `You are a master book cover art director and typographer for commercial bestsellers.
Given an ebook's metadata, analyze the genre, target audience, and subject matter to determine the optimal visual concept, color palette, and typography hierarchy.

CRITICAL RULES FOR imagePrompt:
1. Describe ONLY the background artwork/illustration or visual scene.
2. MUST explicitly require: "Artwork only. Absolutely no text, no titles, no subtitles, no author names, no letters, no words, no signatures, no watermarks, no publisher logos. Keep generous negative space at the top 35% and bottom 20% for overlaid typography."
3. Tailor the visual style to the genre (e.g. clean 3D/vector for tech, dramatic lighting for thriller, whimsical illustration for children, sleek minimalism for business).
4. backgroundColor must be a valid 6-character hex code (e.g. #0f172a) that matches the artwork's deepest tones.
5. shade must be between 0.1 and 0.55 so text overlaid on the artwork remains legible.
6. titleColor and authorColor must contrast sharply against the background.`;

    const userPrompt = `Ebook Title: ${title}
Subtitle: ${subtitle}
Author: ${authorName}
Topic: ${topic}
Category/Type: ${bookType}
Target Audience: ${targetAudience}
Description: ${description}
Language: ${language}
Preferred Style: ${input.style || 'Best matching commercial bestseller style'}
Color Mood: ${input.colorMood || 'Harmonious with subject matter'}
User Instructions: ${input.userPrompt || 'None'}`;

    try {
      const { data } = await openaiProvider.json({
        system: systemPrompt,
        user: userPrompt,
        schema: aiCoverPlanSchema,
        name: 'cover_design_plan',
        model: env.OPENAI_TEXT_MODEL,
        maxOutputTokens: 2500,
      });
      return data;
    } catch {
      return selectFallbackPlan(topic, input.style);
    }
  },

  async generate(userId: string, bookId: string, input: AiCoverRequest) {
    const book = await getOwnedBook(userId, bookId);
    const brief = await getBrief(bookId).catch(() => null);

    const title = input.title || book.title || 'Untitled Book';
    const subtitle = input.subtitle !== undefined ? input.subtitle : book.subtitle || '';
    const authorName = input.authorName || brief?.authorName || '';
    const language = book.language || 'en';
    const isRtl = ['ar', 'fa', 'ur'].includes(language);

    const plan = await this.plan(userId, bookId, input);

    let rawImageBuffer: Buffer;
    if (env.AI_MOCK) {
      // Deterministic SVG mock artwork
      const svg = `<svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${plan.backgroundColor}"/>
            <stop offset="50%" stop-color="#1e293b"/>
            <stop offset="100%" stop-color="#020617"/>
          </linearGradient>
          <radialGradient id="r" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="${plan.titleColor}" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="${plan.backgroundColor}" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="1024" height="1536" fill="url(#g)"/>
        <circle cx="512" cy="768" r="420" fill="url(#r)"/>
        <circle cx="512" cy="768" r="320" fill="none" stroke="${plan.titleColor}" stroke-opacity="0.3" stroke-width="2"/>
        <circle cx="512" cy="768" r="220" fill="none" stroke="${plan.titleColor}" stroke-opacity="0.2" stroke-width="1.5" stroke-dasharray="8 8"/>
      </svg>`;
      rawImageBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    } else {
      if (!env.OPENAI_API_KEY) throw serviceUnavailable('OpenAI is not configured for image generation.');
      rawImageBuffer = await imageProvider.generate({
        schema: 1,
        request: {
          purpose: 'cover',
          prompt: plan.imagePrompt,
          aspect: 'portrait',
          expectedCredits: env.IMAGE_GENERATION_CREDITS,
        },
        visual: {
          style: plan.genre,
          palette: plan.backgroundColor,
          characters: '',
          direction: plan.visualConcept,
        },
        title,
        model: env.OPENAI_IMAGE_MODEL,
      });
    }

    const mime = rawImageBuffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'image/png'
      : rawImageBuffer[0] === 255 && rawImageBuffer[1] === 216 && rawImageBuffer[2] === 255
        ? 'image/jpeg'
        : 'image/webp';

    const sanitized = await sanitizeImage(rawImageBuffer, mime);
    const hash = createHash('sha256').update(sanitized.data).digest('hex');
    const storageKey = `assets/${userId}/${randomUUID()}.webp`;

    await storage.put(storageKey, sanitized.data, 'image/webp');

    const result = await prisma.$transaction(async tx => {
      await lockBook(tx, bookId, userId);

      const asset = await tx.asset.create({
        data: {
          userId,
          storageKey,
          sha256: hash,
          width: sanitized.width,
          height: sanitized.height,
          bytes: sanitized.data.length,
          status: 'ready',
          provenance: `ai:cover-designer`,
          alt: `AI generated cover artwork for ${title}`,
        },
      });

      await tx.assetReference.create({
        data: {
          assetId: asset.id,
          bookId,
        },
      });

      const latest = await tx.coverDesign.findFirst({
        where: { bookId },
        orderBy: { version: 'desc' },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      const coverDesign: CoverDesign = {
        artworkId: asset.id,
        background: plan.backgroundColor,
        shade: plan.shade,
        visual: {
          style: plan.genre,
          palette: plan.backgroundColor,
          characters: '',
          direction: plan.visualConcept,
        },
        title: {
          text: title,
          font: plan.titleFont,
          color: plan.titleColor,
          x: 0.08,
          y: plan.titleY,
          width: 0.84,
          height: plan.titleHeight,
          size: plan.titleSize,
          weight: '700',
          align: plan.titleAlign,
          direction: isRtl ? 'rtl' : 'ltr',
        },
        subtitle: {
          text: subtitle,
          font: plan.subtitleFont,
          color: plan.subtitleColor,
          x: 0.08,
          y: plan.subtitleY,
          width: 0.84,
          height: plan.subtitleHeight,
          size: plan.subtitleSize,
          weight: '400',
          align: plan.subtitleAlign,
          direction: isRtl ? 'rtl' : 'ltr',
        },
        author: {
          text: authorName,
          font: plan.authorFont,
          color: plan.authorColor,
          x: 0.08,
          y: plan.authorY,
          width: 0.84,
          height: plan.authorHeight,
          size: plan.authorSize,
          weight: '700',
          align: plan.authorAlign,
          direction: isRtl ? 'rtl' : 'ltr',
        },
      };

      const validated = coverDesignSchema.parse(coverDesign);
      await pinImages(tx, userId, bookId, artworkDocument(asset.id));

      const saved = await tx.coverDesign.create({
        data: {
          bookId,
          version: nextVersion,
          data: validated,
        },
      });

      return {
        version: saved.version,
        data: validated,
        assetId: asset.id,
        plan,
      };
    });

    return result;
  },

  async variations(userId: string, bookId: string, input: AiCoverRequest) {
    const book = await getOwnedBook(userId, bookId);
    const brief = await getBrief(bookId).catch(() => null);

    const title = input.title || book.title || 'Untitled Book';
    const subtitle = input.subtitle !== undefined ? input.subtitle : book.subtitle || '';
    const authorName = input.authorName || brief?.authorName || '';
    const topic = brief?.topic || book.title;

    // Generate 3 diverse visual styles for user selection
    const styles = ['modern', 'minimalist', 'editorial'];
    const plans = await Promise.all(
      styles.map((style) => this.plan(userId, bookId, { ...input, style }))
    );

    return {
      title,
      subtitle,
      authorName,
      topic,
      variations: plans.map((p, idx) => ({
        id: `var-${idx + 1}`,
        styleName: styles[idx],
        plan: p,
      })),
    };
  },
};
