import { entitlementAllows, FREE_TIER_ENTITLEMENTS, type EntitlementKey } from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { forbidden } from "../../utils/errors.js";
import type { Tx } from "../credits/creditService.js";

/**
 * S12 entitlement enforcement.
 *
 * Entitlements are what a paid plan grants. They are written when a payment is
 * verified and withdrawn when it is refunded or the subscription is cancelled.
 *
 * Until this module existed, the entitlements were recorded and displayed but
 * nothing read them, so a free author could call a paid endpoint directly. The
 * check here is the server-side half of the release gate: hiding a button in
 * the browser never substitutes for it.
 *
 * The free tier holds the capabilities the product publishes as free — export
 * and private source import. Those are not entitlements and are never written
 * or withdrawn; they are the baseline every author has. What a paid plan adds
 * is what gets gated.
 */

/**
 * The entitlements an author currently holds.
 *
 * The free-tier baseline is merged in first, so a capability the product
 * publishes as free is available to every author and a refund cannot take it
 * away. The paid entitlements are written on top of it.
 */
export async function readEntitlements(
  userId: string,
  tx?: Tx,
): Promise<Partial<Record<EntitlementKey, string | number | boolean>>> {
  const client = tx ?? prisma;
  const rows = await client.entitlement.findMany({ where: { userId } });
  const now = Date.now();
  const values: Partial<Record<EntitlementKey, string | number | boolean>> = {
    ...FREE_TIER_ENTITLEMENTS,
  };
  for (const row of rows) {
    // An entitlement that has expired grants nothing, even before the row is
    // swept away.
    if (row.expiresAt && row.expiresAt.getTime() <= now) continue;
    values[row.key as EntitlementKey] = row.value as string | number | boolean;
  }
  return values;
}

/**
 * Whether the author holds an entitlement.
 *
 * A missing entitlement denies the use. The free tier is the absence of
 * entitlements, so a free author holds none and nothing paid is unlocked.
 */
export async function hasEntitlement(
  userId: string,
  key: EntitlementKey,
  required?: number,
  tx?: Tx,
): Promise<boolean> {
  const entitlements = await readEntitlements(userId, tx);
  return entitlementAllows(entitlements, key, required);
}

/**
 * Requires an entitlement, or refuses the request.
 *
 * The refusal is a 403 with the entitlement named, so a client can tell the
 * author what to buy rather than showing a generic error.
 */
export async function requireEntitlement(
  userId: string,
  key: EntitlementKey,
  required?: number,
): Promise<void> {
  if (await hasEntitlement(userId, key, required)) return;
  throw forbidden(
    `This action needs the "${key}" capability, which this plan does not include.`,
    { entitlement: key, required: required ?? null },
  );
}

/**
 * Requires a numeric entitlement to be at least a given amount.
 *
 * This is the quota check: a plan that carries `maxBooks: 5` allows five books,
 * and the sixth is refused rather than silently allowed.
 */
export async function requireEntitlementAtLeast(
  userId: string,
  key: EntitlementKey,
  required: number,
): Promise<void> {
  await requireEntitlement(userId, key, required);
}

/**
 * The remaining headroom on a numeric entitlement.
 *
 * `null` means the entitlement is absent, so the use is not allowed at all.
 * A free author has no headroom on any paid quota.
 */
export async function entitlementHeadroom(
  userId: string,
  key: EntitlementKey,
  tx?: Tx,
): Promise<number | null> {
  const entitlements = await readEntitlements(userId, tx);
  const value = entitlements[key];
  if (value === undefined || value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Whether a numeric entitlement has room for one more use.
 *
 * The current usage is counted by the caller, because what counts as a "book"
 * or a "chapter" depends on the thing being limited.
 */
export async function withinQuota(
  userId: string,
  key: EntitlementKey,
  currentUsage: number,
): Promise<boolean> {
  const headroom = await entitlementHeadroom(userId, key);
  if (headroom === null) return false;
  return currentUsage < headroom;
}

/**
 * Requires that a book stays within the plan's chapter quota.
 *
 * `incoming` is the number of chapters the operation would create. When it is
 * not given, the book's existing chapter count is checked on its own.
 *
 * The count is taken before the write, so a refusal leaves nothing behind.
 *
 * `tx` is the caller's transaction when there is one. The count has to be read
 * through the same client that will do the write: reading through a second
 * connection inside an open transaction would not see the transaction's own
 * uncommitted rows, and would deadlock against the write lock.
 */
export async function assertChapterQuota(
  userId: string,
  bookId: string,
  incoming: number | undefined,
  tx?: Tx,
): Promise<void> {
  const headroom = (await entitlementHeadroom(userId, "maxChaptersPerBook", tx)) ?? Number(FREE_TIER_ENTITLEMENTS.maxChaptersPerBook ?? 10);
  const client = tx ?? prisma;
  const existing = await client.chapter.count({ where: { bookId } });
  const total = incoming === undefined ? existing : existing + incoming;
  if (total > headroom) {
    throw forbidden(
      `This plan includes ${headroom} ${headroom === 1 ? "chapter" : "chapters"} per book. This change would make ${total}.`,
      { entitlement: "maxChaptersPerBook", limit: headroom, requested: total },
    );
  }
}
