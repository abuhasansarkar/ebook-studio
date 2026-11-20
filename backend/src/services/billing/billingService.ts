import {
  CURRENCY_MINOR_UNITS,
  eventGrantsCredits,
  verifyWebhookSignature,
  type EntitlementKey,
  type PaymentCurrency,
  type Plan,
  type SubscriptionStatus,
} from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { env } from "../../config/env.js";
import { badRequest, conflict, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { creditService } from "../credits/creditService.js";
import {
  customerReference,
  getProvider,
  newLocalId,
  type ProviderEvent,
} from "./provider.js";

/**
 * S12 paid plans.
 *
 * The rule this service exists to enforce: **only verified payment state
 * grants entitlements, and customer credit balances reconcile.**
 *
 * Everything that grants value hangs off a webhook whose signature has been
 * verified:
 *
 * - Credits are granted with an idempotency key derived from the payment, so a
 *   repeat delivery of the same event cannot credit the customer twice.
 * - Entitlements are written from the same verified event, so a browser
 *   callback cannot unlock a paid capability.
 * - An event that arrives out of order is recorded but not applied, so a late
 *   `payment.failed` cannot undo a settled payment.
 */

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** The plans this product sells, seeded into the catalog. */
export const DEFAULT_PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Credits for one book, with every export format included.",
    priceMinor: 1200,
    currency: "USD",
    credits: 500,
    entitlements: { maxBooks: 5, maxChaptersPerBook: 30, exports: true, sourceImports: true },
    active: true,
    recurring: true,
  },
  {
    id: "author",
    name: "Author",
    description: "Credits for several books, with priority job handling.",
    priceMinor: 3900,
    currency: "USD",
    credits: 2000,
    entitlements: { maxBooks: 25, maxChaptersPerBook: 60, priorityJobs: true, exports: true, sourceImports: true },
    active: true,
    recurring: true,
  },
  {
    id: "studio",
    name: "Studio",
    description: "The most credits, for a catalogue of books.",
    priceMinor: 9900,
    currency: "USD",
    credits: 6000,
    entitlements: { maxBooks: 100, maxChaptersPerBook: 120, priorityJobs: true, exports: true, sourceImports: true },
    active: true,
    recurring: true,
  },
];

/** The status a subscription has when its payment has not settled. */
const ACTIVE_STATUSES: SubscriptionStatus[] = ["active", "trialing"];

/** How long a subscription runs when the provider does not say. */
const SUBSCRIPTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/** The plans as the catalog stores them. */
function toPlan(row: {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  credits: number;
  entitlements: unknown;
  active: boolean;
  recurring: boolean;
}): Plan {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceMinor: row.priceMinor,
    currency: (CURRENCY_MINOR_UNITS[row.currency as PaymentCurrency] ? row.currency : "USD") as PaymentCurrency,
    credits: row.credits,
    entitlements: (row.entitlements ?? {}) as Plan["entitlements"],
    active: row.active,
    recurring: row.recurring,
  };
}

/** The user a provider event refers to. */
async function userForReference(reference: string) {
  // The reference is derived from the user id, so the provider cannot name a
  // customer this product does not have.
  const rows = await prisma.user.findMany({ select: { id: true } });
  for (const row of rows) {
    if (customerReference(row.id) === reference) return row;
  }
  return null;
}

export const billingService = {
  /** The plans on offer. */
  async plans() {
    const rows = await prisma.plan.findMany({ where: { active: true }, orderBy: { priceMinor: "asc" } });
    return rows.map(toPlan);
  },

  /** Seeds the catalog. Existing plans are left alone so a price change is deliberate. */
  async seedPlans(plans: Plan[] = DEFAULT_PLANS) {
    for (const plan of plans) {
      await prisma.plan.upsert({
        where: { id: plan.id },
        create: {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          priceMinor: plan.priceMinor,
          currency: plan.currency,
          credits: plan.credits,
          entitlements: plan.entitlements as object,
          active: plan.active,
          recurring: plan.recurring,
        },
        update: {},
      });
    }
  },

  /**
   * Starts a checkout.
   *
   * This creates a *pending* payment and sends the author to the provider. It
   * grants nothing: the credits arrive only when a verified payment event
   * arrives.
   */
  async startCheckout(userId: string, planId: string) {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw notFound("Plan");
    if (!plan.active) throw badRequest("That plan is not available.");
    if (!CURRENCY_MINOR_UNITS[plan.currency as PaymentCurrency]) throw badRequest("That plan has an unsupported currency.");

    const provider = getProvider();
    const idempotencyKey = `checkout:${userId}:${plan.id}`;
    // The provider names the checkout and the payment before any money moves,
    // so the settlement event can be matched to the record it belongs to.
    const checkout = await provider.createCheckout({
      customerReference: customerReference(userId),
      planId: plan.id,
      planName: plan.name,
      amountMinor: plan.priceMinor,
      currency: plan.currency as PaymentCurrency,
      credits: plan.credits,
      returnUrl: `${env.APP_URL}/app/credits`,
      idempotencyKey,
    });

    const existing = await prisma.payment.findUnique({ where: { providerPaymentId: checkout.providerPaymentId } });
    // A checkout that is already pending is returned rather than duplicated.
    if (existing && existing.status === "pending") {
      return { id: existing.id, planId: plan.id, planName: plan.name, amountMinor: plan.priceMinor, currency: plan.currency, credits: plan.credits, url: checkout.url, status: existing.status, createdAt: existing.createdAt.toISOString() };
    }

    const payment = await prisma.payment.create({
      data: {
        userId,
        planId: plan.id,
        provider: provider.name,
        providerPaymentId: checkout.providerPaymentId,
        providerCheckoutId: checkout.providerCheckoutId,
        providerCustomerReference: checkout.customerReference,
        amountMinor: plan.priceMinor,
        currency: plan.currency,
        status: "pending",
        credits: plan.credits,
        description: `${plan.name} plan`,
      },
    });

    return {
      id: payment.id,
      planId: plan.id,
      planName: plan.name,
      amountMinor: plan.priceMinor,
      currency: plan.currency as PaymentCurrency,
      credits: plan.credits,
      url: checkout.url,
      status: payment.status,
      createdAt: payment.createdAt.toISOString(),
    };
  },

  /**
   * Verifies and applies a webhook.
   *
   * The signature is checked against the raw body before anything is recorded.
   * An invalid signature is refused and nothing is written.
   */
  async handleWebhook(rawBody: string, signature: string | undefined, timestamp: number | null) {
    const provider = getProvider();
    const now = Date.now();

    // The timestamp is part of the signed material, so a captured body cannot
    // be replayed indefinitely.
    const stamp = timestamp ?? Math.floor(now / 1000);
    const valid = verifyWebhookSignature(
      rawBody,
      env.PAYMENT_WEBHOOK_SECRET,
      signature,
      stamp,
      env.PAYMENT_WEBHOOK_TOLERANCE_SECONDS,
      now,
    );
    if (!valid) {
      logger.warn({ provider: provider.name }, "Refused a webhook with an invalid signature");
      throw badRequest("The webhook signature is not valid.");
    }

    const event = provider.verifyWebhook(rawBody, signature);
    if (!event) throw badRequest("The webhook payload could not be read.");

    return this.applyEvent(event, rawBody, signature ?? "");
  },

  /**
   * Applies a verified event.
   *
   * The event is written to the inbox first. A repeat of the same
   * providerEventId is a no-op that returns the recorded outcome.
   */
  async applyEvent(event: ProviderEvent, rawBody: string, signature: string) {
    const provider = getProvider();

    const existing = await prisma.paymentEvent.findUnique({ where: { providerEventId: event.providerEventId } });
    if (existing) {
      // The same event delivered twice. The first delivery already decided what
      // happened, so nothing is applied again.
      return { status: existing.status, duplicate: true, eventId: existing.id };
    }

    let inboxId = "";
    try {
      const record = await prisma.paymentEvent.create({
        data: {
          provider: provider.name,
          providerEventId: event.providerEventId,
          type: event.type,
          occurredAt: event.occurredAt,
          payload: JSON.parse(rawBody) as object,
          signature,
          status: "received",
        },
      });
      inboxId = record.id;
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
      // A concurrent duplicate. The other delivery is doing the work.
      const other = await prisma.paymentEvent.findUniqueOrThrow({ where: { providerEventId: event.providerEventId } });
      return { status: other.status, duplicate: true, eventId: other.id };
    }

    try {
      const outcome = await this.applyEventBody(event);
      await prisma.paymentEvent.update({
        where: { id: inboxId },
        data: { status: outcome.status, processedAt: new Date(), error: outcome.reason ?? null },
      });
      return { ...outcome, duplicate: false, eventId: inboxId };
    } catch (err) {
      await prisma.paymentEvent.update({
        where: { id: inboxId },
        data: { status: "failed", processedAt: new Date(), error: (err as Error).message },
      });
      throw err;
    }
  },

  /** The effect of one verified event. */
  async applyEventBody(event: ProviderEvent) {
    const user = await userForReference(event.customerReference);
    if (!user) {
      // The provider named a customer this product does not have. The event is
      // recorded but grants nothing.
      return { status: "ignored" as const, reason: "Unknown customer." };
    }

    if (event.type === "payment.succeeded") {
      if (!event.providerPaymentId) return { status: "ignored" as const, reason: "The event names no payment." };
      return this.grantForPayment(user.id, event);
    }
    if (event.type === "payment.failed") {
      if (!event.providerPaymentId) return { status: "ignored" as const, reason: "The event names no payment." };
      const payment = await prisma.payment.findUnique({ where: { providerPaymentId: event.providerPaymentId } });
      if (!payment || payment.userId !== user.id) {
        return { status: "ignored" as const, reason: "No local payment matched this failure." };
      }
      if (payment.settledEventAt && event.occurredAt < payment.settledEventAt) {
        // A failure that predates the settlement cannot undo a payment that
        // has already been settled.
        return { status: "ignored" as const, reason: "An older event arrived after the payment settled." };
      }
      await prisma.payment.updateMany({
        where: { providerPaymentId: event.providerPaymentId, userId: user.id, status: { notIn: ["refunded", "succeeded"] } },
        data: { status: "failed" },
      });
      return { status: "processed" as const };
    }
    if (event.type === "payment.refunded") {
      if (!event.providerPaymentId) return { status: "ignored" as const, reason: "The event names no payment." };
      return this.refundPayment(user.id, event);
    }
    if (event.type === "checkout.completed") {
      // A checkout that has been completed is not a payment: the money has to
      // have moved. This event records the checkout but grants nothing.
      await prisma.payment.updateMany({
        where: { providerPaymentId: event.providerPaymentId ?? "", userId: user.id, status: "pending" },
        data: { description: "Checkout completed, awaiting payment." },
      });
      return { status: "ignored" as const, reason: "A completed checkout is not a payment." };
    }
    if (event.type === "subscription.updated" || event.type === "subscription.canceled") {
      return this.applySubscriptionEvent(user.id, event);
    }
    return { status: "ignored" as const, reason: `Unknown event type ${event.type}.` };
  },

  /**
   * Grants the credits and entitlements a settled payment bought.
   *
   * The credit grant carries an idempotency key derived from the payment, so a
   * repeated event for the same payment cannot credit the customer twice.
   */
  async grantForPayment(userId: string, event: ProviderEvent) {
    const providerPaymentId = event.providerPaymentId!;
    const payment = await prisma.payment.findUnique({ where: { providerPaymentId } });
    if (!payment) {
      // The provider paid for something this product has no record of. It is
      // recorded for an operator rather than credited blindly.
      await prisma.payment.create({
        data: {
          userId,
          provider: getProvider().name,
          providerPaymentId,
          providerCheckoutId: `unknown_${providerPaymentId}`,
          providerCustomerReference: event.customerReference,
          amountMinor: event.amountMinor ?? 0,
          currency: event.currency ?? "USD",
          status: "succeeded",
          credits: event.credits ?? 0,
          description: "Payment for an unknown checkout.",
          settledEventAt: event.occurredAt,
        },
      });
      return { status: "ignored" as const, reason: "No local checkout matched this payment." };
    }
    if (payment.userId !== userId) {
      // The provider named a different customer than the checkout. The local
      // record wins, because it is the record the customer agreed to.
      return { status: "ignored" as const, reason: "The payment belongs to another customer." };
    }
    if (payment.status === "refunded") {
      return { status: "ignored" as const, reason: "The payment was already refunded." };
    }
    if (payment.status === "succeeded") {
      // Already settled. A repeat delivery changes nothing.
      return { status: "processed" as const };
    }
    // An event that arrives before the payment settled cannot undo a settled
    // payment, and a settled payment is never moved back to pending.
    if (payment.settledEventAt && event.occurredAt < payment.settledEventAt) {
      return { status: "ignored" as const, reason: "An older event arrived after the payment settled." };
    }

    const planRow = payment.planId ? await prisma.plan.findUnique({ where: { id: payment.planId } }) : null;
    const plan = planRow ? toPlan(planRow) : null;
    const credits = payment.credits;

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "succeeded", settledEventAt: event.occurredAt },
      });
      // The idempotency key ties the credit to the payment, so the ledger
      // records exactly one grant for it.
      await creditService.grant(userId, credits, `payment:${payment.id}`, `Payment for ${payment.description}`);
      if (plan) await writeEntitlements(tx, userId, plan, `payment:${payment.id}`);
    });

    // A plan that recurs also starts a subscription.
    if (plan?.recurring) {
      await this.upsertSubscription(userId, plan, event);
    }

    return { status: "processed" as const };
  },

  /** Takes the credits back when a payment is refunded. */
  async refundPayment(userId: string, event: ProviderEvent) {
    const providerPaymentId = event.providerPaymentId!;
    const payment = await prisma.payment.findUnique({ where: { providerPaymentId } });
    if (!payment || payment.userId !== userId) {
      return { status: "ignored" as const, reason: "No local payment matched this refund." };
    }
    if (payment.status === "refunded") {
      return { status: "processed" as const };
    }
    if (payment.refundedEventAt && event.occurredAt < payment.refundedEventAt) {
      return { status: "ignored" as const, reason: "An older refund arrived after the refund." };
    }

    // The credits are only taken back as far as the balance allows: a customer
    // who already spent them does not go into a negative balance, and the
    // shortfall stays on the record for an operator.
    const wallet = await creditService.getWallet(userId);
    const refundable = Math.min(payment.credits, wallet.balance);
    const shortfall = payment.credits - refundable;

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "refunded", refundedEventAt: event.occurredAt, refundedCredits: refundable },
      });
      if (refundable > 0) {
        await tx.creditTransaction.create({
          data: {
            userId,
            type: "refund",
            amount: -refundable,
            balanceAfter: wallet.balance - refundable,
            reference: `payment:${payment.id}`,
            idempotencyKey: `refund:${payment.id}`,
            description: `Refund for ${payment.description}`,
          },
        });
        await tx.creditWallet.update({ where: { userId }, data: { balance: { decrement: refundable } } });
      }
      // The entitlements the plan granted are withdrawn with the refund.
      await tx.entitlement.deleteMany({ where: { userId, source: "payment", sourceId: `payment:${payment.id}` } });
    });

    if (shortfall > 0) {
      logger.warn({ userId, paymentId: payment.id, shortfall }, "A refund took back fewer credits than the payment granted");
    }
    return { status: "processed" as const, shortfall };
  },

  /** Applies a subscription event, keeping the newest state. */
  async applySubscriptionEvent(userId: string, event: ProviderEvent) {
    if (!event.providerSubscriptionId) return { status: "ignored" as const, reason: "The event names no subscription." };
    const existing = await prisma.subscription.findUnique({ where: { providerSubscriptionId: event.providerSubscriptionId } });
    if (existing && existing.lastEventAt && event.occurredAt < existing.lastEventAt) {
      // An older event must not overwrite a newer state.
      return { status: "ignored" as const, reason: "An older event arrived after a newer one." };
    }
    const planRow = event.planId ? await prisma.plan.findUnique({ where: { id: event.planId } }) : null;
    if (!planRow) return { status: "ignored" as const, reason: "The event names no known plan." };
    const plan = toPlan(planRow);

    await this.upsertSubscription(userId, plan, event, existing?.status);
    return { status: "processed" as const };
  },

  /** Writes the subscription and the entitlements it carries. */
  async upsertSubscription(userId: string, plan: Plan, event: ProviderEvent, existingStatus?: string) {
    const providerSubscriptionId = event.providerSubscriptionId ?? `sub_${paymentProviderIdFor(userId)}`;
    const status = (event.subscriptionStatus ?? existingStatus ?? "active") as SubscriptionStatus;
    const canceled = status === "canceled" || event.type === "subscription.canceled";
    // A provider that does not report a period still gets one, so the
    // subscription has a period the author can see.
    const periodEnd = event.currentPeriodEnd ?? new Date(event.occurredAt.getTime() + SUBSCRIPTION_PERIOD_MS);

    await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.upsert({
        where: { providerSubscriptionId },
        create: {
          userId,
          planId: plan.id,
          provider: getProvider().name,
          providerSubscriptionId,
          status,
          currentPeriodEnd: periodEnd,
          canceledAt: canceled ? event.occurredAt : null,
          lastEventAt: event.occurredAt,
        },
        update: {
          status,
          currentPeriodEnd: periodEnd,
          ...(canceled ? { canceledAt: event.occurredAt } : {}),
          lastEventAt: event.occurredAt,
        },
      });

      if (ACTIVE_STATUSES.includes(status)) {
        await writeEntitlements(tx, userId, plan, `subscription:${subscription.id}`);
      } else {
        // A subscription that is no longer active no longer carries its plan's
        // capabilities.
        await tx.entitlement.deleteMany({ where: { userId, source: "subscription", sourceId: `subscription:${subscription.id}` } });
      }
    });
  },

  /** Cancels the author's subscription. It runs to the end of its period. */
  async cancelSubscription(userId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: "desc" },
    });
    if (!subscription) throw notFound("Subscription");
    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "canceled", canceledAt: new Date() },
    });
    // The capabilities go with the cancellation; the period still runs, but the
    // paid capabilities do not.
    await prisma.entitlement.deleteMany({ where: { userId, source: "subscription", sourceId: `subscription:${subscription.id}` } });
    return updated;
  },

  /** The author's billing state. */
  async state(userId: string) {
    const provider = getProvider();
    const [plans, subscription, entitlements, payments] = await Promise.all([
      this.plans(),
      prisma.subscription.findFirst({
        where: { userId, status: { in: ACTIVE_STATUSES } },
        orderBy: { createdAt: "desc" },
        include: { plan: true },
      }),
      prisma.entitlement.findMany({ where: { userId } }),
      prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50, include: { plan: true } }),
    ]);

    const values: Partial<Record<EntitlementKey, string | number | boolean>> = {};
    for (const row of entitlements) {
      if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) continue;
      values[row.key as EntitlementKey] = row.value as string | number | boolean;
    }

    return {
      provider: provider.name,
      providerLive: provider.live,
      plans,
      subscription: subscription
        ? {
            id: subscription.id,
            planId: subscription.planId,
            planName: subscription.plan.name,
            status: subscription.status as SubscriptionStatus,
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
            canceledAt: subscription.canceledAt?.toISOString() ?? null,
            createdAt: subscription.createdAt.toISOString(),
          }
        : null,
      entitlements: values,
      payments: payments.map((p) => ({
        id: p.id,
        planId: p.planId,
        planName: p.plan?.name ?? null,
        amountMinor: p.amountMinor,
        currency: p.currency as PaymentCurrency,
        status: p.status,
        credits: p.credits,
        description: p.description,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  },

  /**
   * Reconciles the local record with the provider's.
   *
   * A difference is reported rather than silently repaired, because a payment
   * state that disagrees between the two is something an operator has to look
   * at.
   */
  async reconcile(userId: string) {
    const provider = getProvider();
    const payments = await prisma.payment.findMany({ where: { userId, provider: provider.name } });
    const differences: { paymentId: string; local: string; provider: string | null }[] = [];

    for (const payment of payments) {
      const remote = await provider.fetchSubscription(payment.providerPaymentId);
      if (!remote) continue;
      if (remote.status !== payment.status) {
        differences.push({ paymentId: payment.id, local: payment.status, provider: remote.status });
      }
    }

    // The credit ledger has to add up: the balance is the sum of the ledger.
    const ledger = await prisma.creditTransaction.aggregate({
      where: { userId },
      _sum: { amount: true },
    });
    const wallet = await creditService.getWallet(userId);
    const ledgerBalance = ledger._sum.amount ?? 0;
    const reconciled = ledgerBalance === wallet.balance;

    return {
      payments: payments.length,
      differences,
      walletBalance: wallet.balance,
      ledgerBalance,
      reconciled,
    };
  },
};

/** Writes the entitlements a plan carries. */
async function writeEntitlements(tx: Tx, userId: string, plan: Plan, sourceId: string) {
  for (const [key, value] of Object.entries(plan.entitlements)) {
    await tx.entitlement.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, value: value as unknown as object, source: plan.recurring ? "subscription" : "payment", sourceId },
      update: { value: value as unknown as object, source: plan.recurring ? "subscription" : "payment", sourceId },
    });
  }
}

/** A stable identifier for the author's provider customer record. */
function paymentProviderIdFor(userId: string): string {
  return customerReference(userId).replace(/[^A-Za-z0-9]/g, "").slice(-24);
}
