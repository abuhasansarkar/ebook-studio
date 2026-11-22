import { notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import type { Tx } from "../credits/creditService.js";
import { cleanupAssets } from "../assets/assetService.js";
import { storage } from "../storage/storage.js";

/** Asset fields safe to return to the client (never the storage key or owner). */
export const publicAssetSelect = {
  id: true,
  width: true,
  height: true,
  status: true,
  createdAt: true,
} as const;

/** Provenance prefix of images the coloring studio generated (as opposed to library uploads). */
const GENERATED_PROVENANCE = "ai:coloring";

/**
 * Locks an image the user owns and that is ready, or refuses with 404.
 *
 * Mirrors `lockAsset` in assetService: another user's image is
 * indistinguishable from a missing one.
 */
export async function lockOwnedAsset(tx: Tx, userId: string, assetId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM assets WHERE id = ${assetId} AND "userId" = ${userId} AND status = 'ready' FOR UPDATE`;
  if (!rows.length) throw notFound("Image");
}

/** Pins an owned, ready image to the book so asset cleanup retains it. */
export async function attachAsset(tx: Tx, userId: string, bookId: string, assetId: string) {
  await lockOwnedAsset(tx, userId, assetId);
  await tx.assetReference.upsert({
    where: { assetId_bookId: { assetId, bookId } },
    create: { assetId, bookId },
    update: {},
  });
}

/**
 * Releases the book's hold on an image a page no longer shows.
 *
 * The book reference is dropped only when no other page or cover version of
 * the book still uses the image. A generated coloring image that nothing
 * references any more is marked for deletion; an image from the author's
 * library stays in the library. Returns the id to garbage-collect, if any —
 * call `collectReleasedAssets` after the transaction commits.
 */
export async function releaseAsset(tx: Tx, userId: string, bookId: string, assetId: string): Promise<string | null> {
  const pagesUsing = await tx.coloringPage.count({ where: { bookId, assetId } });
  if (pagesUsing) return null;
  const coversUsing = await tx.coverDesign.count({ where: { bookId, data: { path: ["artworkId"], equals: assetId } } });
  if (coversUsing) return null;
  await tx.assetReference.deleteMany({ where: { assetId, bookId } });

  const asset = await tx.asset.findFirst({ where: { id: assetId, userId }, select: { provenance: true } });
  if (!asset?.provenance.startsWith(GENERATED_PROVENANCE)) return null;
  if (await tx.assetReference.count({ where: { assetId } })) return null;
  const marked = await tx.asset.updateMany({ where: { id: assetId, userId, status: "ready" }, data: { status: "deleting" } });
  return marked.count ? assetId : null;
}

/** Removes released images from storage now; the worker's cleanup sweep retries failures. */
export async function collectReleasedAssets(ids: (string | null | undefined)[]) {
  for (const id of ids) {
    if (!id) continue;
    await cleanupAssets(id).catch((err) => logger.warn({ err, assetId: id }, "Released coloring image cleanup deferred"));
  }
}

/** An asset row is usable by this user's book only when the user owns it and it is ready. */
export function isUsableAsset<T extends { userId: string; status: string }>(asset: T | null | undefined, userId: string): asset is T {
  return Boolean(asset && asset.userId === userId && asset.status === "ready");
}

/** Loads an asset's bytes from storage. */
export async function readAssetBytes(storageKey: string): Promise<Buffer> {
  const { stream } = await storage.getStream(storageKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
