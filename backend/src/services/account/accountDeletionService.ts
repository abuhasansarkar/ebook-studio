import { prisma } from "../../database/prisma.js";
import { conflict, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { cleanupAssets } from "../assets/assetService.js";
import { storage } from "../storage/storage.js";

/**
 * Deletes an account the way a person expects, without destroying the
 * financial record.
 *
 * The credit ledger and payments are immutable history (the schema refuses
 * to cascade them from the user), so the `user` row itself is kept as an
 * anonymous tombstone: name and email are replaced, `deletedAt` is set, and
 * every credential, session and pending code goes. Everything the person made
 * — books and everything under them, projects, uploads, exports, sources,
 * marketing material — is deleted, and the stored files are removed.
 *
 * Kept, on purpose: credit transactions, payments, subscriptions (already
 * ended), the wallet balance (for reconciliation), and the audit trail.
 */

/** Subscription states that would keep billing a deleted account. */
const BILLING_STATES = ["active", "trialing", "past_due", "incomplete"];

export const DELETED_NAME = "Deleted account";
export const deletedEmail = (userId: string) => `deleted+${userId}@deleted.invalid`;

export async function deleteAccount(userId: string, options: { requestId?: string } = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw notFound("Account");

  const renewing = await prisma.subscription.findFirst({
    where: { userId, status: { in: BILLING_STATES }, canceledAt: null },
    select: { id: true },
  });
  if (renewing) throw conflict("Cancel your subscription before deleting your account, so it is not charged again.");

  const result = await prisma.$transaction(async (tx) => {
    // The user row serialises concurrent deletions; the book rows are the
    // same locks job creation takes (lockBook), so no job can start on these
    // books while they are being removed.
    await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
    const books = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM books WHERE "userId" = ${userId} ORDER BY id FOR UPDATE`;

    const activeJob = await tx.generationJob.findFirst({ where: { userId, status: { in: ["queued", "running"] } }, select: { id: true } });
    if (activeJob) throw conflict("Some of your books are still being generated. Cancel or wait for them, then delete your account.", { jobId: activeJob.id });
    const activeExport = await tx.export.findFirst({ where: { userId, status: { in: ["queued", "processing"] } }, select: { id: true } });
    if (activeExport) throw conflict("An export is still being prepared. Wait for it to finish, then delete your account.");

    // Every stored object the account owns, read before its row goes.
    const keyRows = await Promise.all([
      tx.export.findMany({ where: { userId, storageKey: { not: null } }, select: { storageKey: true } }),
      tx.researchSource.findMany({ where: { userId, storageKey: { not: null } }, select: { storageKey: true } }),
      tx.distributionPackage.findMany({ where: { userId, storageKey: { not: null } }, select: { storageKey: true } }),
      tx.marketingGraphic.findMany({ where: { userId, storageKey: { not: null } }, select: { storageKey: true } }),
      tx.marketingSample.findMany({ where: { userId, storageKey: { not: null } }, select: { storageKey: true } }),
    ]);
    const storageKeys = [...new Set(keyRows.flat().map((row) => row.storageKey!))];
    const assets = await tx.asset.findMany({ where: { userId, status: { not: "deleted" } }, select: { id: true } });

    // Restrict relations first: reports pin jobs, jobs pin assets, and
    // asset pins hold books. Everything else cascades from the book.
    await tx.qualityReport.deleteMany({ where: { userId } });
    await tx.assetReference.deleteMany({ where: { OR: [{ book: { userId } }, { asset: { userId } }] } });
    await tx.generationJob.deleteMany({ where: { userId } });
    await tx.book.deleteMany({ where: { userId } });
    await tx.project.deleteMany({ where: { userId } });
    // Owned directly by the user as well as by a book.
    await tx.export.deleteMany({ where: { userId } });
    await tx.operation.deleteMany({ where: { userId } });
    await tx.researchSource.deleteMany({ where: { userId } });
    await tx.distributionPackage.deleteMany({ where: { userId } });
    await tx.publishingStatus.deleteMany({ where: { userId } });
    await tx.marketingDraft.deleteMany({ where: { userId } });
    await tx.marketingGraphic.deleteMany({ where: { userId } });
    await tx.marketingSample.deleteMany({ where: { userId } });
    await tx.listing.deleteMany({ where: { userId } });
    // Uploads become `deleting`; cleanup removes the bytes after commit.
    await tx.asset.updateMany({ where: { userId, status: { not: "deleted" } }, data: { status: "deleting", alt: "", caption: "" } });

    // Settled reservation bookkeeping goes; an unsettled one (a crashed
    // inline request) is left for the reservation sweeper, which releases it
    // through the ledger so the wallet still reconciles. Neither holds PII.
    await tx.creditReservation.deleteMany({ where: { userId, settledAt: { not: null } } });

    // Capabilities and privileges end with the account.
    await tx.entitlement.deleteMany({ where: { userId } });
    await tx.adminRole.deleteMany({ where: { userId } });

    // Support history stays for the operators, without the person in it.
    await tx.supportRequest.updateMany({
      where: { userId },
      data: { email: null, subject: "[removed with the account]", message: "[removed with the account]", context: null },
    });

    // Credentials, sessions and pending codes (and their encrypted deliveries).
    const email = user.email.toLowerCase();
    const verifications = await tx.verification.findMany({
      where: { OR: [{ identifier: { endsWith: `-otp-${email}` } }, { identifier: { endsWith: `:${email}` } }, { value: userId }] },
      select: { id: true },
    });
    const verificationIds = verifications.map((v) => v.id);
    if (verificationIds.length) {
      await tx.emailDelivery.deleteMany({ where: { verificationId: { in: verificationIds } } });
      await tx.verification.deleteMany({ where: { id: { in: verificationIds } } });
    }
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });

    // The tombstone. Ledger and payment rows still point at this id.
    const deletedAt = new Date();
    await tx.user.update({
      where: { id: userId },
      data: { name: DELETED_NAME, email: deletedEmail(userId), emailVerified: false, image: null, deletedAt },
    });

    await tx.adminAuditEntry.create({
      data: {
        actorId: userId,
        action: "account.delete",
        targetType: "user",
        targetId: userId,
        reason: "Deleted by the account holder.",
        details: { books: books.length, assets: assets.length, files: storageKeys.length },
        requestId: options.requestId ?? null,
      },
    });

    return { books: books.length, assetIds: assets.map((a) => a.id), storageKeys, deletedAt };
  }, { timeout: 60_000 });

  // Files go after the commit: a storage failure must not resurrect the
  // account, and a missing file is not an error. Leftovers are logged by key
  // only (no personal data); assets left `deleting` are retried by cleanup.
  const removals = await Promise.allSettled(result.storageKeys.map((key) => storage.remove(key)));
  const failed = removals.filter((r) => r.status === "rejected").length;
  if (failed) logger.warn({ userId, failed }, "Some files of a deleted account could not be removed yet");
  for (const id of result.assetIds) {
    await cleanupAssets(id).catch((err) => logger.warn({ err, assetId: id }, "Asset cleanup after account deletion failed; cleanup will retry"));
  }

  return { deletedAt: result.deletedAt, books: result.books, assets: result.assetIds.length, files: result.storageKeys.length };
}
