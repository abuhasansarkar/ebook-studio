import OpenAI from 'openai';
import sharp from 'sharp';
import { z } from 'zod';
import { artDirectionSchema, imageRequestSchema } from '@ebook/shared';
import { env, imageModelSchema } from '../../config/env.js';
import { serviceUnavailable } from '../../utils/errors.js';
export const imageSnapshotSchema = z.object({ schema: z.literal(1), request: imageRequestSchema, visual: artDirectionSchema, title: z.string(), model: imageModelSchema });
export type ImageSnapshot = z.infer<typeof imageSnapshotSchema>;
export const imageProvider = {
  async generate(input: ImageSnapshot): Promise<Buffer> {
    const isDallE = input.model.startsWith('dall-e');
    const size = isDallE
      ? (input.request.aspect === 'portrait' ? '1024x1792' : input.request.aspect === 'landscape' ? '1792x1024' : '1024x1024')
      : (input.request.aspect === 'portrait' ? '1024x1536' : input.request.aspect === 'landscape' ? '1536x1024' : '1024x1024');

    if (env.AI_MOCK) {
      const [width, height] = size.split('x').map(Number);
      return sharp({ create: { width, height, channels: 3, background: '#28596c' } }).png().toBuffer();
    }
    if (!env.OPENAI_API_KEY) throw serviceUnavailable('Image generation is not configured.');
    // No automatic SDK retries: an ambiguous provider timeout can already have incurred cost.
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0, timeout: 120000 });

    const promptText = [
      `Create ${input.request.purpose === 'cover' ? 'ebook front-cover artwork with space for separately composed title and author overlays' : 'an interior book illustration'}.`,
      'Artwork only. Do not draw titles, captions, lettering, logos, signatures or watermarks.',
      `Book context: ${input.title}`, `Scene: ${input.request.prompt}`, `Style: ${input.visual.style}`, `Palette: ${input.visual.palette}`, `Characters: ${input.visual.characters}`, `Visual direction: ${input.visual.direction}`,
    ].join('\n');

    const params: any = {
      model: input.model,
      n: 1,
      size,
      prompt: promptText,
    };

    if (isDallE) {
      params.quality = 'standard';
      params.response_format = 'b64_json';
    } else {
      params.quality = 'medium';
      params.output_format = 'png';
    }

    const response = await client.images.generate(params);
    const item = response.data?.[0];
    if (item?.b64_json) {
      const b64 = item.b64_json;
      if (b64.length > 20 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(b64)) throw new Error('Image provider returned an invalid or oversized result');
      return Buffer.from(b64, 'base64');
    }
    if (item?.url) {
      const res = await fetch(item.url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`Failed to download image from provider URL (${res.status})`);
      return Buffer.from(await res.arrayBuffer());
    }
    throw new Error('Image provider returned an invalid or empty result');
  },
};
