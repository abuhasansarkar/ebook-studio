import { FREE_SIGNUP_CREDITS } from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { conflict, paymentRequired } from "../../utils/errors.js";
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
}

export const creditService = {
  async getWallet(userId: string) {
    return prisma.creditWallet.upsert({ where: { userId }, create: { userId }, update: {} });
  },

  async listTransactions(userId: string, take = 50) {
    return prisma.creditTransaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
  },

  async grant(userId: string, amount: number, idempotencyKey: string, description: string) {
    await runIdempotent(async (tx) => {
      if (await alreadyApplied(tx, idempotencyKey)) return;
      await ensureWallet(tx, userId);
      const wallet = await tx.creditWallet.update({ where: { userId }, data: { balance: { increment: amount } } });
      await tx.creditTransaction.create({
        data: { userId, type: "grant", amount, balanceAfter: wallet.balance, idempotencyKey, description },
      });
    });
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
