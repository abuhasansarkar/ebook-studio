import { FREE_SIGNUP_CREDITS } from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { paymentRequired } from "../../utils/errors.js";

/**
 * Credit ledger.
 *
 * - `wallet.balance` is spendable; `wallet.reserved` is held for running jobs.
 * - Every mutation writes an immutable `CreditTransaction` with a unique `idempotencyKey`
 *   in the same DB transaction, so a retried operation is a no-op (never double-charges).
 */

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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

  /** Move credits from balance to reserved. Throws 402 if the balance is insufficient. */
  async reserve(userId: string, amount: number, reference: string) {
    const idempotencyKey = `reserve:${reference}`;
    await runIdempotent(async (tx) => {
      if (await alreadyApplied(tx, idempotencyKey)) return;
      await ensureWallet(tx, userId);
      // Conditional update: atomic check-and-decrement prevents overspending under concurrency.
      const res = await tx.creditWallet.updateMany({
        where: { userId, balance: { gte: amount } },
        data: { balance: { decrement: amount }, reserved: { increment: amount } },
      });
      if (res.count === 0) {
        const wallet = await tx.creditWallet.findUniqueOrThrow({ where: { userId } });
        throw paymentRequired(`This needs ${amount} credits but you have ${wallet.balance}.`, {
          required: amount,
          balance: wallet.balance,
        });
      }
      const wallet = await tx.creditWallet.findUniqueOrThrow({ where: { userId } });
      await tx.creditTransaction.create({
        data: { userId, type: "reserve", amount: -amount, balanceAfter: wallet.balance, reference, idempotencyKey, description: "Reserved for job" },
      });
    });
  },

  /**
   * Settle a reservation: `charged` credits are consumed, the remainder returns to balance.
   * Safe to call multiple times for the same reference.
   */
  async settle(userId: string, reserved: number, charged: number, reference: string) {
    const idempotencyKey = `settle:${reference}`;
    const consumed = Math.min(Math.max(charged, 0), reserved);
    const released = reserved - consumed;
    await runIdempotent(async (tx) => {
      if (await alreadyApplied(tx, idempotencyKey)) return;
      const wallet = await tx.creditWallet.update({
        where: { userId },
        data: { reserved: { decrement: reserved }, balance: { increment: released } },
      });
      await tx.creditTransaction.create({
        data: {
          userId,
          type: released === reserved ? "refund" : "charge",
          amount: released,
          balanceAfter: wallet.balance,
          reference,
          idempotencyKey,
          description: `Used ${consumed} credits, returned ${released}`,
        },
      });
    });
    return { consumed, released };
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
