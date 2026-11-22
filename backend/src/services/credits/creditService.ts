import { FREE_SIGNUP_CREDITS } from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { conflict, paymentRequired } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
/**
 * Credit ledger.
 *
 * - `wallet.balance` is spendable; `wallet.reserved` is held for running jobs.
 * - Every mutation writes an immutable `CreditTransaction` with a unique `idempotencyKey`
 *   in the same DB transaction, so a retried operation is a no-op (never double-charges).
 */

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

async function alreadyApplied(tx: Tx, idempotencyKey: string): Promise<boolean> {
  const existing = await tx.creditTransaction.findUnique({ where: { idempotencyKey } });
  return existing !== null;
}

async function ensureWallet(tx: Tx, userId: string) {
  return tx.creditWallet.upsert({ where: { userId }, create: { userId }, update: {} });
}

async function runIdempotent(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await prisma.$transaction(fn);
  } catch (err) {
    if (isUniqueViolation(err)) return; // concurrent duplicate — already applied
    throw err;
  }
}

/**
 * Runs a transaction that returns a value, tolerating a concurrent duplicate.
 *
 * When a concurrent request already applied the same idempotency key, the
 * stored outcome is returned instead of the operation running twice.
 */
async function runIdempotentWithResult<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(fn);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict("That operation was already applied.");
    }
    throw err;
  }
}

function assertCredits(amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid credit amount');
}

/** A reservation owned by a background job: the job runtime settles it, the sweeper never does. */
function reservationKind(reference: string): "job" | "sync" {
  return reference.startsWith("job:") ? "job" : "sync";
}

/**
 * How long a synchronous reservation may stay open before the sweeper treats
 * its request as crashed and releases the credits. It is far longer than any
 * synchronous provider call is allowed to run, so a slow request that is still
 * alive is not swept from under itself.
 */
export const STALE_RESERVATION_MS = 30 * 60 * 1000;

export async function reserveInTransaction(tx: Tx, userId: string, amount: number, reference: string) {
  assertCredits(amount);
  const idempotencyKey = `reserve:${reference}`;
  const existing = await tx.creditTransaction.findUnique({ where: { idempotencyKey } });
  if (existing) {
    if (existing.userId !== userId || existing.amount !== -amount) throw new Error('Reservation identity mismatch');
    return;
  }
  await ensureWallet(tx, userId);
  const res = await tx.creditWallet.updateMany({
    where: { userId, balance: { gte: amount } },
    data: { balance: { decrement: amount }, reserved: { increment: amount } },
  });
  if (!res.count) {
    const wallet = await tx.creditWallet.findUniqueOrThrow({ where: { userId } });
    throw paymentRequired(`This needs ${amount} credits but you have ${wallet.balance}.`, { required: amount, balance: wallet.balance });
  }
  const wallet = await tx.creditWallet.findUniqueOrThrow({ where: { userId } });
  await tx.creditTransaction.create({ data: { userId, type: 'reserve', amount: -amount, balanceAfter: wallet.balance, reference, idempotencyKey, description: 'Reserved for job' } });
  // Tracked until settled, so a reservation a crash leaves open can be found.
  await tx.creditReservation.create({ data: { userId, reference, amount, kind: reservationKind(reference) } });
}

export async function settleInTransaction(tx: Tx, userId: string, reserved: number, charged: number, reference: string) {
  assertCredits(reserved);
  assertCredits(charged);
  if (charged > reserved) throw new Error('Charges exceed the reservation');
  const idempotencyKey = `settle:${reference}`;
  if (await alreadyApplied(tx, idempotencyKey)) return;
  const reservation = await tx.creditTransaction.findUnique({ where: { idempotencyKey: `reserve:${reference}` } });
  if (!reservation || reservation.userId !== userId || reservation.amount !== -reserved) throw new Error('Reservation ledger mismatch; operator review required');
  const released = reserved - charged;
  const changed = await tx.creditWallet.updateMany({ where: { userId, reserved: { gte: reserved } }, data: { reserved: { decrement: reserved }, balance: { increment: released } } });
  if (!changed.count) throw new Error('Reserved balance mismatch; operator review required');
  const wallet = await tx.creditWallet.findUniqueOrThrow({ where: { userId } });
  await tx.creditTransaction.create({ data: { userId, type: released === reserved ? 'refund' : 'charge', amount: released, balanceAfter: wallet.balance, reference, idempotencyKey, description: `Used ${charged} credits, returned ${released}` } });
  await tx.creditReservation.updateMany({ where: { reference, settledAt: null }, data: { settledAt: new Date() } });
}

/**
 * Grants credits inside the caller's transaction.
 *
 * The grant commits or rolls back with whatever else the caller writes (a
 * settled payment, an entitlement), so a crash can never leave a payment
 * marked settled without its credits or the other way round.
 *
 * Returns whether the grant was applied now (false when the idempotency key
 * was already in the ledger).
 */
export async function grantInTransaction(tx: Tx, userId: string, amount: number, idempotencyKey: string, description: string, reference?: string) {
  assertCredits(amount);
  if (await alreadyApplied(tx, idempotencyKey)) return { applied: false };
  await ensureWallet(tx, userId);
  const wallet = await tx.creditWallet.update({ where: { userId }, data: { balance: { increment: amount } } });
  await tx.creditTransaction.create({
    data: { userId, type: "grant", amount, balanceAfter: wallet.balance, idempotencyKey, description, reference: reference ?? null },
  });
  return { applied: true, balance: wallet.balance };
}

/**
 * Takes credits back inside the caller's transaction, never below zero.
 *
 * The wallet row is locked and read inside the transaction, so the amount
 * taken and the `balanceAfter` written to the ledger are computed from the
 * balance as it is now, not from a read made before the transaction started.
 * What could not be taken (because it was already spent) is returned as the
 * shortfall for the caller to record; the wallet never goes negative.
 */
export async function clawBackInTransaction(tx: Tx, userId: string, owed: number, idempotencyKey: string, description: string, reference?: string) {
  assertCredits(owed);
  const existing = await tx.creditTransaction.findUnique({ where: { idempotencyKey } });
  if (existing) return { applied: false, taken: -existing.amount, shortfall: 0, balance: existing.balanceAfter };
  await ensureWallet(tx, userId);
  const [locked] = await tx.$queryRaw<{ balance: number }[]>`SELECT "balance" FROM "credit_wallets" WHERE "userId" = ${userId} FOR UPDATE`;
  const balance = locked?.balance ?? 0;
  const taken = Math.min(owed, Math.max(balance, 0));
  const shortfall = owed - taken;
  if (taken === 0) return { applied: false, taken: 0, shortfall, balance };
  const wallet = await tx.creditWallet.update({ where: { userId }, data: { balance: { decrement: taken } } });
  await tx.creditTransaction.create({
    data: { userId, type: "refund", amount: -taken, balanceAfter: wallet.balance, idempotencyKey, description, reference: reference ?? null },
  });
  return { applied: true, taken, shortfall, balance: wallet.balance };
}

export const creditService = {
  async getWallet(userId: string) {
    return prisma.creditWallet.upsert({ where: { userId }, create: { userId }, update: {} });
  },

  async listTransactions(userId: string, take = 50) {
    return (await this.pageTransactions(userId, take)).transactions;
  },

  /** One page of the ledger, newest first, continuing after `cursor` (a transaction id). */
  async pageTransactions(userId: string, take = 50, cursor?: string) {
    const rows = await prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    // The cursor must be the caller's own row; another author's id finds nothing here.
    const transactions = rows.slice(0, take);
    return { transactions, nextCursor: rows.length > take ? transactions[transactions.length - 1].id : null };
  },

  async grant(userId: string, amount: number, idempotencyKey: string, description: string) {
    await runIdempotent(async (tx) => {
      await grantInTransaction(tx, userId, amount, idempotencyKey, description);
    });
  },

  /**
   * Releases synchronous reservations that were never settled.
   *
   * A request that reserves credits, calls a provider and settles afterwards
   * leaks the reservation if the process dies in between: the credits stay
   * "reserved" forever. Every reservation is tracked in `credit_reservations`,
   * and this releases each `sync` one older than `olderThanMs` back to the
   * balance through the ordinary settle path (charged 0), so the ledger still
   * reconciles and a late settle for the same reference becomes a no-op.
   *
   * Job reservations are never swept: the job runtime owns their recovery.
   * Safe to run concurrently: the settle ledger key is unique, so a second
   * sweeper (or a late real settle) loses the race and changes nothing.
   */
  async sweepStaleReservations(olderThanMs = STALE_RESERVATION_MS, limit = 200) {
    const cutoff = new Date(Date.now() - olderThanMs);
    const stale = await prisma.creditReservation.findMany({
      // `job:` references belong to a background job (chapters, outline,
      // quality, covers, coloring pages): the job runtime settles them, and
      // releasing one under a live job would make its later charge a no-op.
      // They are excluded by reference as well as by kind, so a misclassified
      // row can never be swept.
      where: { kind: "sync", settledAt: null, createdAt: { lt: cutoff }, NOT: { reference: { startsWith: "job:" } } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    let released = 0;
    for (const reservation of stale) {
      try {
        await prisma.$transaction(async (tx) => {
          const ledger = await tx.creditTransaction.findUnique({ where: { idempotencyKey: `reserve:${reservation.reference}` } });
          if (!ledger) {
            // The ledger row is gone (the user was deleted): nothing to release.
            await tx.creditReservation.update({ where: { id: reservation.id }, data: { settledAt: new Date() } });
            return;
          }
          const settled = await tx.creditTransaction.findUnique({ where: { idempotencyKey: `settle:${reservation.reference}` } });
          if (!settled) {
            await settleInTransaction(tx, reservation.userId, reservation.amount, 0, reservation.reference);
            released++;
          }
          await tx.creditReservation.updateMany({ where: { id: reservation.id, settledAt: null }, data: { settledAt: new Date() } });
        });
      } catch (err) {
        if (isUniqueViolation(err)) continue; // settled concurrently
        logger.error({ err: (err as Error).message, reference: reservation.reference }, "Could not release a stale credit reservation");
      }
    }
    if (released) logger.warn({ released }, "Released stale credit reservations");
    return { scanned: stale.length, released };
  },

  grantSignupBonus(userId: string) {
    return this.grant(userId, FREE_SIGNUP_CREDITS, `signup:${userId}`, "Welcome credits");
  },

  /**
   * Adjusts a balance by an operator.
   *
   * The adjustment lands in the same immutable ledger as every other credit
   * movement, so the balance still reconciles against the ledger afterwards.
   * A negative adjustment may not take the balance below zero: an operator
   * mistake cannot create a negative balance that a customer then has to
   * explain.
   */
  async adjust(userId: string, amount: number, idempotencyKey: string, description: string) {
    return runIdempotentWithResult(async (tx) => {
      if (await alreadyApplied(tx, idempotencyKey)) {
        const wallet = await ensureWallet(tx, userId);
        return { balance: wallet.balance, transactionId: "" };
      }
      await ensureWallet(tx, userId);
      const current = await tx.creditWallet.findUniqueOrThrow({ where: { userId } });
      if (current.balance + amount < 0) {
        throw paymentRequired(
          `That adjustment would take the balance below zero. The customer has ${current.balance} credits.`,
          { balance: current.balance, requested: amount },
        );
      }
      const wallet = await tx.creditWallet.update({ where: { userId }, data: { balance: { increment: amount } } });
      const transaction = await tx.creditTransaction.create({
        data: {
          userId,
          type: amount >= 0 ? "grant" : "refund",
          amount,
          balanceAfter: wallet.balance,
          idempotencyKey,
          description,
        },
      });
      return { balance: wallet.balance, transactionId: transaction.id };
    });
  },

  /** Move credits from balance to reserved. Throws 402 if the balance is insufficient. */
  async reserve(userId: string, amount: number, reference: string) {
    await runIdempotent(tx => reserveInTransaction(tx, userId, amount, reference));
  },

  /**
   * Settle a reservation: `charged` credits are consumed, the remainder returns to balance.
   * Safe to call multiple times for the same reference.
   */
  async settle(userId: string, reserved: number, charged: number, reference: string) {
    await runIdempotent(tx => settleInTransaction(tx, userId, reserved, charged, reference));
    const consumed = Math.min(Math.max(charged, 0), reserved);
    return { consumed, released: reserved - consumed };
  },

  /** Immediate, atomic spend for small synchronous operations. */
  async spend(userId: string, amount: number, idempotencyKey: string, description: string) {
    await runIdempotent(async (tx) => {
      if (await alreadyApplied(tx, idempotencyKey)) return;
      await ensureWallet(tx, userId);
      const res = await tx.creditWallet.updateMany({
        where: { userId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (res.count === 0) throw paymentRequired(`This needs ${amount} credit(s). Your balance is too low.`);
      const wallet = await tx.creditWallet.findUniqueOrThrow({ where: { userId } });
      await tx.creditTransaction.create({
        data: { userId, type: "charge", amount: -amount, balanceAfter: wallet.balance, idempotencyKey, description },
      });
    });
  },
};
