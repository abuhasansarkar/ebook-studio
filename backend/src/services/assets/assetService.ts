import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { prisma } from '../../database/prisma.js';
import { badRequest, conflict, notFound, serviceUnavailable } from '../../utils/errors.js';
import type { Tx } from '../credits/creditService.js';
import { storage } from '../storage/storage.js';
import { documentError, imageAssetIds } from '@ebook/shared';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
let processing = 0;
export async function sanitizeImage(body: Buffer, mime: string) {
  if (!Buffer.isBuffer(body) || !body.length || body.length > MAX_IMAGE_BYTES) throw badRequest('Choose an image between 1 byte and 10 MiB.');
  const signature = body.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : body[0] === 255 && body[1] === 216 && body[2] === 255 ? 'image/jpeg'
    : body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
  if (!signature || signature !== mime) throw badRequest('Upload a PNG, JPEG or WebP whose file type matches its contents.');
  // APNG is valid PNG but must not silently lose its animation on conversion.
  if (signature === 'image/png') {
    for (let offset = 8; offset + 12 <= body.length;) {
      const length = body.readUInt32BE(offset);
      if (body.toString('ascii', offset + 4, offset + 8) === 'acTL') throw badRequest('Animated images are not supported. Choose a still image.');
      offset += length + 12;
    }
  }
  if (processing >= 2) throw serviceUnavailable('Image processing is busy. Please retry shortly.');
  processing++;
  try {
    const image = sharp(body, { limitInputPixels: 24_000_000, failOn: 'warning', sequentialRead: true }).timeout({ seconds: 20 });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || meta.width > 10000 || meta.height > 10000 || (meta.pages ?? 1) !== 1) throw new Error('dimensions or animation');
    const { data, info } = await image.rotate().webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
    if (data.length > MAX_IMAGE_BYTES) throw new Error('processed image too large');
    return { data, width: info.width, height: info.height };
  } catch {
    throw badRequest('Image could not be decoded safely. Use a still PNG, JPEG or WebP up to 24 megapixels and 10,000 pixels per side.');
  } finally { processing--; }
}
const select = { id: true, width: true, height: true, bytes: true, alt: true, caption: true, provenance: true, createdAt: true, _count: { select: { references: true } } } as const;
async function lockAsset(tx: Tx, userId: string, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM assets WHERE id = ${id} AND "userId" = ${userId} AND status = 'ready' FOR UPDATE`;
  if (!rows.length) throw notFound('Image');
}
export async function pinImages(tx: Tx, userId: string, bookId: string, document: unknown) {
  return pinImageDocuments(tx, userId, bookId, [document]);
}
export async function pinImageDocuments(tx: Tx, userId: string, bookId: string, documents: unknown[]) {
  for (const assetId of [...new Set(documents.flatMap(imageAssetIds))].sort()) {
    await lockAsset(tx, userId, assetId);
    await tx.assetReference.upsert({ where: { assetId_bookId: { assetId, bookId } }, create: { assetId, bookId }, update: {} });
  }
}
export const assetService = {
  async upload(userId: string, body: Buffer, mime: string) {
    const { data, width, height } = await sanitizeImage(body, mime);
    const asset = await prisma.asset.create({ data: { userId, storageKey: `assets/${userId}/${randomUUID()}.webp`, sha256: createHash('sha256').update(data).digest('hex'), width, height, bytes: data.length } });
    // Row exists before any object write: interrupted uploads remain discoverable for cleanup.
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM assets WHERE id = ${asset.id} FOR UPDATE`;
      await storage.put(asset.storageKey, data, 'image/webp');
      return tx.asset.update({ where: { id: asset.id }, data: { status: 'ready' }, select });
    }, { timeout: 60000 });
  },
  async list(userId: string, cursor?: string) {
    const rows = await prisma.asset.findMany({ where: { userId, status: 'ready', ...(cursor ? { id: { lt: cursor } } : {}) }, orderBy: { id: 'desc' }, take: 25, select });
    return { assets: rows.slice(0, 24), nextCursor: rows.length > 24 ? rows[23].id : null };
  },
  async content(userId: string, id: string) {
    const asset = await prisma.asset.findFirst({ where: { id, userId, status: 'ready' } });
    if (!asset) throw notFound('Image');
    return storage.getStream(asset.storageKey);
  },
  async update(userId: string, id: string, input: { alt: string; caption: string }) {
    return prisma.$transaction(async tx => {
      await lockAsset(tx, userId, id);
      return tx.asset.update({ where: { id }, data: input, select });
    });
  },
  async remove(userId: string, id: string) {
    await prisma.$transaction(async tx => {
      await lockAsset(tx, userId, id);
      if (await tx.assetReference.count({ where: { assetId: id } })) throw conflict('This image is retained by a manuscript or its history and cannot be deleted.');
      await tx.asset.update({ where: { id }, data: { status: 'deleting' } });
    });
    // Physical removal is retried by cleanup if storage is unavailable.
    await cleanupAssets(id);
  },
  async exportImages(userId: string, documents: unknown[]) {
    const result: Record<string, string> = {};
    const occurrences = new Map<string, number>();
    for (const document of documents) {
      if (document == null) continue;
      const error = documentError(document);
      if (error) throw badRequest(error);
      const nodes = [document as { type?: string; attrs?: { assetId?: string }; content?: unknown[] }];
      while (nodes.length) {
        const node = nodes.pop()!;
        if (node.type === 'image' && node.attrs?.assetId) occurrences.set(node.attrs.assetId, (occurrences.get(node.attrs.assetId) ?? 0) + 1);
        if (node.content) nodes.push(...node.content as typeof nodes);
      }
    }
    let total = 0;
    for (const id of [...new Set(documents.flatMap(imageAssetIds))]) {
      const { stream } = await assetService.content(userId, id);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        const data = Buffer.from(chunk); total += data.length * (occurrences.get(id) ?? 1);
        if (total > 50 * 1024 * 1024) { stream.destroy(); throw badRequest('Images exceed the 50 MiB export limit. Split this book into smaller volumes.'); }
        chunks.push(data);
      }
      result[id] = `data:image/webp;base64,${Buffer.concat(chunks).toString('base64')}`;
    }
    return result;
  },
};
export async function cleanupAssets(id?: string) {
  const rows = await prisma.asset.findMany({ where: { ...(id ? { id } : {}), OR: [{ status: 'deleting' }, { status: 'processing', createdAt: { lt: new Date(Date.now() - 3600000) } }] }, take: 100, orderBy: { createdAt: 'asc' } });
  for (const row of rows) await prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM assets WHERE id = ${row.id} FOR UPDATE SKIP LOCKED`;
    if (!locked.length) return;
    const current = await tx.asset.findUniqueOrThrow({ where: { id: row.id } });
    if (!['processing', 'deleting'].includes(current.status)) return;
    if (await tx.assetReference.count({ where: { assetId: row.id } })) return;
    await storage.remove(current.storageKey);
    await tx.asset.update({ where: { id: row.id }, data: { status: 'deleted' } });
  }, { timeout: 60000 });
}
