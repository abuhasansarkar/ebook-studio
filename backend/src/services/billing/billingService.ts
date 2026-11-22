import {
  CURRENCY_MINOR_UNITS,
  verifyWebhookSignature,
  type EntitlementKey,
  type PaymentCurrency,
  type Plan,
  type SubscriptionStatus,
} from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { env } from "../../config/env.js";
import { AppError, badRequest, conflict, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { clawBackInTransaction, creditService, grantInTransaction, type Tx } from "../credits/creditService.js";
import {
  customerReference,
  getProvider,
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


/** The plans this product sells, seeded into the catalog. */
export const DEFAULT_PLANS: Plan[] = [
  {
    id: "creator",
    name: "Creator Pro",
    description: "Ideal for new authors. Full Pro exports and essential generation credits.",
    priceMinor: 2900,
    currency: "USD",
    credits: 300,
    entitlements: { maxBooks: 5, maxChaptersPerBook: 30, exports: true, priorityJobs: false },
    active: true,
    recurring: true,
    interval: "month",
  },
  {
    id: "creator-yearly",
    name: "Creator Pro (Annual)",
    description: "Save 20%! Full Pro exports and 3,600 credits billed annually ($23.20/mo).",
    priceMinor: 27800,
    currency: "USD",
    credits: 3600,
    entitlements: { maxBooks: 5, maxChaptersPerBook: 30, exports: true, priorityJobs: false },
    active: true,
    recurring: true,
    interval: "year",
  },
  {
    id: "author",
    name: "Author Pro",
    description: "Most popular! Priority AI generation, higher limits, and full Pro exports.",
    priceMinor: 4900,
    currency: "USD",
    credits: 750,
    entitlements: { maxBooks: 25, maxChaptersPerBook: 60, exports: true, priorityJobs: true },
    active: true,
    recurring: true,
    interval: "month",
  },
  {
    id: "author-yearly",
    name: "Author Pro (Annual)",
    description: "Save 20%! Most popular choice for active creators billed annually ($39.20/mo).",
    priceMinor: 47000,
    currency: "USD",
    credits: 9000,
    entitlements: { maxBooks: 25, maxChaptersPerBook: 60, exports: true, priorityJobs: true },
    active: true,
    recurring: true,
    interval: "year",
  },
  {
    id: "studio",
    name: "Studio Pro",
    description: "Maximum scale for prolific authors with highest credit quota and priority AI.",
    priceMinor: 9900,
    currency: "USD",
    credits: 2000,
    entitlements: { maxBooks: 100, maxChaptersPerBook: 120, exports: true, priorityJobs: true },
    active: true,
    recurring: true,
    interval: "month",
  },
  {
    id: "studio-yearly",
    name: "Studio Pro (Annual)",
    description: "Save 20%! Maximum scale, highest quotas, and priority handling billed annually ($79.20/mo).",
    priceMinor: 95000,
    currency: "USD",
    credits: 24000,
    entitlements: { maxBooks: 100, maxChaptersPerBook: 120, exports: true, priorityJobs: true },
    active: true,
    recurring: true,
    interval: "year",
  },
  // One-Time Credit Top-Up Packs (No subscription)
  {
    id: "pack-mini",
    name: "Mini Credit Pack",
    description: "150 extra generation credits. One-time purchase, never expires.",
    priceMinor: 900,
    currency: "USD",
    credits: 150,
    entitlements: {},
    active: true,
    recurring: false,
  },
  {
    id: "pack-creator",
    name: "Creator Credit Pack",
    description: "500 extra generation credits. One-time purchase, never expires.",
    priceMinor: 2500,
    currency: "USD",
    credits: 500,
    entitlements: {},
    active: true,
    recurring: false,
  },
  {
    id: "pack-power",
    name: "Power Credit Pack",
    description: "1,200 extra generation credits. One-time purchase, never expires.",
    priceMinor: 4900,
    currency: "USD",
    credits: 1200,
    entitlements: {},
    active: true,
    recurring: false,
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
  const isYearly = row.id.endsWith("-yearly");
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
    interval: row.recurring ? (isYearly ? "year" : "month") : undefined,
  };
}

/** A `received` inbox row whose claim is older than this belongs to a crashed attempt. */
export const STALE_EVENT_CLAIM_MS = 5 * 60 * 1000;

/**
 * How long a subscription's capabilities outlive the end of the paid period.
 *
 * A renewal is charged at the period boundary and its `invoice.paid` arrives a
 * little after, so without a grace the author would lose the plan for the
 * minutes in between. A renewal that is not paid within the grace lapses.
 */
export const ENTITLEMENT_GRACE_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The length of a plan's billing period, for a provider that does not report one. */
function periodMs(plan: Plan): number {
  return plan.interval === "year" || plan.id.endsWith("-yearly") ? 365 * DAY_MS : SUBSCRIPTION_PERIOD_MS;
}

/** The user a provider event refers to. */
async function userForReference(reference: string) {
  // The reference is an HMAC of the user id, so it cannot be inverted; it is
  // looked up on the payments we wrote (every customer a provider can name
  // opened a checkout first) and then checked against the HMAC, so the
  // provider cannot name a customer this product does not have.
  if (!reference) return null;
  const payment = await prisma.payment.findFirst({
    where: { providerCustomerReference: reference },
    select: { userId: true },
  });
  if (!payment || customerReference(payment.userId) !== reference) return null;
  return { id: payment.userId };
}

/** A unique-constraint violation. */
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

/** The entitlement source ids a payment produced. */
async function entitlementSourcesOf(client: Tx | typeof prisma, payment: { id: string; providerSubscriptionId: string | null }) {
  const sources = [`payment:${payment.id}`];
  if (payment.providerSubscriptionId) {
    const subscription = await client.subscription.findUnique({ where: { providerSubscriptionId: payment.providerSubscriptionId } });
    if (subscription) sources.push(`subscription:${subscription.id}`);
  }
  return sources;
}

export const billingService = {
  /** The plans on offer. */
  async plans() {
    let rows = await prisma.plan.findMany({ where: { active: true }, orderBy: { priceMinor: "asc" } });
    const hasAll = DEFAULT_PLANS.every((p) => rows.some((r) => r.id === p.id));
    if (!hasAll || rows.length < DEFAULT_PLANS.length) {
      await this.seedPlans();
      rows = await prisma.plan.findMany({ where: { active: true }, orderBy: { priceMinor: "asc" } });
    }
    return rows.map(toPlan);
  },

  /**
   * Seeds the catalog.
   *
   * A seeded plan's entitlement set and pricing are kept in step with the code,
   * so adding new plans or updating quotas takes effect across the catalog.
   * The provider price id is never overwritten: it is configured per
   * environment (the Stripe Price each recurring plan bills against).
   */
  async seedPlans(plans: Plan[] = DEFAULT_PLANS) {
    // Retire legacy plans
    await prisma.plan.updateMany({
      where: { id: { in: ["starter", "starter-yearly"] } },
      data: { active: false },
    });

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
        update: {
          name: plan.name,
          description: plan.description,
          priceMinor: plan.priceMinor,
          currency: plan.currency,
          credits: plan.credits,
          entitlements: plan.entitlements as object,
          active: plan.active,
          recurring: plan.recurring,
        },
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
    const view = toPlan(plan);
    // A recurring plan is a subscription the provider bills every period. A
    // provider that bills subscriptions needs the plan's price there; without
    // it the plan would be charged once and unlock its features forever.
    if (plan.recurring && provider.name !== "local" && !plan.providerPriceId) {
      throw conflict(`The "${plan.name}" subscription is not available yet: it has no ${provider.name} price configured.`, { planId: plan.id });
    }

    // One key per purchase attempt. A repeated click while the checkout is
    // still pending reuses the key (and so the same checkout); once that
    // checkout has settled, failed or been refunded, the next purchase of the
    // same plan is a new attempt with a new key. A key fixed per user and plan
    // would make every later purchase collide with the first one.
    const finishedAttempts = await prisma.payment.count({ where: { userId, planId: plan.id, status: { not: "pending" } } });
    const idempotencyKey = `checkout:${userId}:${plan.id}:${finishedAttempts + 1}`;
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
      recurring: plan.recurring,
      interval: view.interval,
      providerPriceId: plan.providerPriceId,
    });

    const view_ = (row: { id: string; status: string; createdAt: Date }) => ({
      id: row.id,
      planId: plan.id,
      planName: plan.name,
      amountMinor: plan.priceMinor,
      currency: plan.currency as PaymentCurrency,
      credits: plan.credits,
      url: checkout.url,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    });

    const findExisting = () =>
      prisma.payment.findFirst({
        where: { OR: [{ providerPaymentId: checkout.providerPaymentId }, { providerCheckoutId: checkout.providerCheckoutId }] },
      });

    // A checkout that is already pending is returned rather than duplicated.
    const existing = await findExisting();
    if (existing && existing.userId === userId && existing.status === "pending") return view_(existing);

    try {
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
      return view_(payment);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Two clicks raced to the same checkout; the other one wrote it first.
      const winner = await findExisting();
      if (winner && winner.userId === userId) return view_(winner);
      throw conflict("That checkout is already being processed. Refresh and try again.");
    }
  },

  /**
   * Verifies and applies a webhook.
   *
   * The signature is checked against the raw body before anything is recorded.
   * An invalid signature is refused and nothing is written.
   */
  async handleWebhook(
    rawBody: string,
    signature: string | undefined,
    timestamp: number | null,
    provider = getProvider(),
  ) {
    // The provider owns its signature scheme. The local provider signs the
    // body and a timestamp with the shared secret; Stripe signs the body and
    // the timestamp with the endpoint's signing secret and the Stripe SDK
    // checks the tolerance. Both are verified against the *raw* body before
    // the payload is parsed, and both refuse to return an event they cannot
    // vouch for.
    if (provider.name === "local") {
      const now = Date.now();
      // The timestamp is part of the signed material, so a captured body
      // cannot be replayed indefinitely.
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
    }

    const event = provider.verifyWebhook(rawBody, signature);
    if (!event) throw badRequest("The webhook signature is not valid.");

    return this.applyEvent(event, rawBody, signature ?? "");
  },

  /**
   * Claims an inbox row for another attempt.
   *
   * A row that was processed or ignored is final. A row that failed, or one
   * still `received` whose claim is stale (its worker crashed), is claimed
   * again with a conditional update on the state that was read, so two
   * concurrent deliveries can never both win the claim.
   */
  async reclaimEvent(row: { id: string; status: string; claimedAt: Date }) {
    const stale = row.status === "received" && Date.now() - row.claimedAt.getTime() > STALE_EVENT_CLAIM_MS;
    if (row.status !== "failed" && !stale) return false;
    const claimed = await prisma.paymentEvent.updateMany({
      where: { id: row.id, status: row.status, claimedAt: row.claimedAt },
      data: { status: "received", claimedAt: new Date(), attempts: { increment: 1 }, error: null, processedAt: null },
    });
    return claimed.count === 1;
  },

  /**
   * Applies a verified event.
   *
   * The event is written to the inbox first. A repeat of an event that was
   * processed or ignored is a no-op that returns the recorded outcome. A
   * repeat of an event that failed (or whose attempt crashed) is applied
   * again; every effect below is idempotent, so a retry never grants twice.
   * A repeat that arrives while another attempt is still working is refused
   * with a 409, so the provider retries later instead of considering the
   * event delivered.
   */
  async applyEvent(event: ProviderEvent, rawBody: string, signature: string) {
    const provider = getProvider();

    let inboxId = "";
    const existing = await prisma.paymentEvent.findUnique({ where: { providerEventId: event.providerEventId } });
    if (existing) {
      if (!(await this.reclaimEvent(existing))) {
        if (existing.status === "processed" || existing.status === "ignored") {
          return { status: existing.status, duplicate: true, eventId: existing.id };
        }
        throw new AppError(409, "WEBHOOK_IN_PROGRESS", "This event is already being applied. Retry later.", { eventId: existing.id });
      }
      inboxId = existing.id;
    } else {
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
        if (!isUniqueViolation(err)) throw err;
        // A concurrent duplicate. The other delivery is doing the work; this
        // one asks to be retried rather than reporting a success it has not seen.
        const other = await prisma.paymentEvent.findUniqueOrThrow({ where: { providerEventId: event.providerEventId } });
        if (other.status === "processed" || other.status === "ignored") {
          return { status: other.status, duplicate: true, eventId: other.id };
        }
        throw new AppError(409, "WEBHOOK_IN_PROGRESS", "This event is already being applied. Retry later.", { eventId: other.id });
      }
    }

    try {
      const outcome = await this.applyEventBody(await this.withResolvedCheckout(event));
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

  /**
   * Completes an event with the checkout it settles, when the event did not
   * name one.
   *
   * A provider may name a checkout and a payment differently, so a settled
   * event often carries only the payment. The pending record is written
   * against the checkout, so the payment cannot be matched until the checkout
   * is known. The provider is asked, and a provider that cannot answer leaves
   * the event unmatched: a payment is never credited to a guess.
   */
  async withResolvedCheckout(event: ProviderEvent) {
    if (event.type !== "payment.succeeded") return event;
    if (event.providerCheckoutId || !event.providerPaymentId) return event;
    const resolve = getProvider().resolveCheckoutSession?.bind(getProvider());
    if (!resolve) return event;
    const sessionId = await resolve(event.providerPaymentId);
    if (!sessionId) return event;
    return { ...event, providerCheckoutId: sessionId };
  },

  /**
   * The user an event belongs to.
   *
   * The event's own customer reference is the first answer, but a processor is
   * free to omit the metadata we attached to the checkout — a payment intent
   * created outside our checkout session, a refund or dispute on a charge
   * (Stripe does not copy the intent's metadata onto the charge), or a
   * provider that does not copy the session's metadata onto the intent. The
   * payment record we wrote is then the authoritative link: it holds the
   * customer reference, and it is matched by payment, checkout, invoice or
   * subscription id, whatever state the payment is in.
   *
   * Falling back this way is safe because it never widens the grant: the
   * reference still has to resolve to a user we know, and a settlement still
   * has to land on that user's own pending payment.
   */
  async userForEvent(event: ProviderEvent) {
    const direct = await userForReference(event.customerReference);
    if (direct) return direct;
    if (event.customerReference) return null;

    const candidates = [
      event.providerPaymentId ? { providerPaymentId: event.providerPaymentId } : null,
      event.providerCheckoutId ? { providerCheckoutId: event.providerCheckoutId } : null,
      event.providerInvoiceId ? { providerInvoiceId: event.providerInvoiceId } : null,
      event.providerSubscriptionId ? { providerSubscriptionId: event.providerSubscriptionId } : null,
    ].filter((where) => where !== null);

    // A checkout still waiting for its money is the most specific answer, so
    // pending payments are asked first; a refund or dispute then finds the
    // payment it names whatever state that payment is in.
    for (const status of [{ status: "pending" }, {}]) {
      for (const where of candidates) {
        const payment = await prisma.payment.findFirst({ where: { ...where, ...status }, orderBy: { createdAt: "desc" } });
        if (!payment) continue;
        const owner = await userForReference(payment.providerCustomerReference);
        if (owner) return owner;
      }
    }
    if (event.providerSubscriptionId) {
      const subscription = await prisma.subscription.findUnique({ where: { providerSubscriptionId: event.providerSubscriptionId } });
      if (subscription) return { id: subscription.userId };
    }
    return null;
  },

  /** The effect of one verified event. */
  async applyEventBody(event: ProviderEvent) {
    const user = await this.userForEvent(event);
    if (!user) {
      // The provider named a customer this product does not have, and no local
      // checkout claims the payment either. The event is recorded but grants
      // nothing.
      return { status: "ignored" as const, reason: "Unknown customer." };
    }

    switch (event.type) {
      case "payment.succeeded":
        if (!event.providerPaymentId) return { status: "ignored" as const, reason: "The event names no payment." };
        return this.grantForPayment(user.id, event);
      case "invoice.paid":
        return this.applyInvoicePaid(user.id, event);
      case "invoice.payment_failed":
        return this.applyInvoiceFailed(user.id, event);
      case "payment.failed":
        return this.failPayment(user.id, event);
      case "payment.refunded":
        if (!event.providerPaymentId && !event.providerCheckoutId) return { status: "ignored" as const, reason: "The event names no payment." };
        return this.refundPayment(user.id, event);
      case "payment.disputed":
        return this.disputePayment(user.id, event);
      case "payment.dispute_closed":
        return this.closeDispute(user.id, event);
      case "checkout.completed":
        return this.recordCompletedCheckout(user.id, event);
      case "subscription.updated":
      case "subscription.canceled":
        return this.applySubscriptionEvent(user.id, event);
      default:
        return { status: "ignored" as const, reason: `Unknown event type ${event.type}.` };
    }
  },

  /** A completed checkout is not a payment: it is recorded, and grants nothing. */
  async recordCompletedCheckout(userId: string, event: ProviderEvent) {
    if (event.providerCheckoutId || event.providerPaymentId) {
      const pending = await prisma.payment.findFirst({
        where: {
          userId,
          status: "pending",
          OR: [
            ...(event.providerCheckoutId ? [{ providerCheckoutId: event.providerCheckoutId }] : []),
            ...(event.providerPaymentId ? [{ providerPaymentId: event.providerPaymentId }] : []),
          ],
        },
      });
      if (pending) {
        const paymentIdFree = event.providerPaymentId
          ? !(await prisma.payment.findFirst({ where: { providerPaymentId: event.providerPaymentId, id: { not: pending.id } } }))
          : false;
        await prisma.payment.update({
          where: { id: pending.id },
          data: {
            description: "Checkout completed, awaiting payment.",
            ...(paymentIdFree ? { providerPaymentId: event.providerPaymentId } : {}),
            // The subscription the checkout opened, so its first invoice
            // finds this checkout.
            ...(event.providerSubscriptionId ? { providerSubscriptionId: event.providerSubscriptionId } : {}),
          },
        });
      }
    }
    return { status: "ignored" as const, reason: "A completed checkout is not a payment." };
  },

  /** Marks a payment as failed, unless a newer event already settled it. */
  async failPayment(userId: string, event: ProviderEvent) {
    if (!event.providerPaymentId) return { status: "ignored" as const, reason: "The event names no payment." };
    const payment = await prisma.payment.findUnique({ where: { providerPaymentId: event.providerPaymentId } });
    if (!payment || payment.userId !== userId) {
      return { status: "ignored" as const, reason: "No local payment matched this failure." };
    }
    if (payment.settledEventAt && event.occurredAt < payment.settledEventAt) {
      // A failure that predates the settlement cannot undo a payment that
      // has already been settled.
      return { status: "ignored" as const, reason: "An older event arrived after the payment settled." };
    }
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "pending" },
      data: { status: "failed" },
    });
    return { status: "processed" as const };
  },

  /**
   * Finds the pending payment an event settles.
   *
   * A provider names a checkout and a payment differently. A checkout session
   * has one identifier and the payment that settles it has another, and the
   * pending record is written against the checkout. The payment is therefore
   * looked up by either identifier, and the payment identifier is written back
   * onto the record so the next event finds it directly.
   *
   * Only the signed-in author's own pending payments are considered, so one
   * author's event can never settle another's checkout.
   */
  async findPendingPayment(userId: string, event: ProviderEvent) {
    const providerPaymentId = event.providerPaymentId;
    const providerCheckoutId = event.providerCheckoutId;

    const payment =
      (providerPaymentId
        ? await prisma.payment.findFirst({ where: { providerPaymentId, userId, status: "pending" } })
        : null) ??
      (providerCheckoutId
        ? await prisma.payment.findFirst({ where: { providerCheckoutId, userId, status: "pending" } })
        : null);

    if (!payment) return null;

    // The payment identifier is now known, so it is recorded. A later event
    // about the same payment then finds the record directly. The identifier is
    // unique, so it is only written when no other payment already holds it.
    if (providerPaymentId && payment.providerPaymentId !== providerPaymentId) {
      const holder = await prisma.payment.findUnique({ where: { providerPaymentId } });
      if (holder) return payment;
      return prisma.payment.update({
        where: { id: payment.id },
        data: { providerPaymentId },
      });
    }
    return payment;
  },

  /**
   * Grants the credits and entitlements a settled one-time payment bought.
   *
   * The payment is claimed (pending → succeeded) with a conditional update,
   * and the credits and entitlements are written in the same transaction, so
   * the three commit together or not at all and two concurrent settlements
   * cannot both grant.
   */
  async grantForPayment(userId: string, event: ProviderEvent) {
    const providerPaymentId = event.providerPaymentId!;
    const payment = await this.findPendingPayment(userId, event);
    if (!payment) {
      // The provider paid for something this product has no record of, or for a
      // checkout that belongs to another author. It is recorded for an
      // operator rather than credited blindly. The checkout identifier is
      // unique, so a checkout that already exists is never written twice.
      //
      // A record is only written when the event names a checkout. A placeholder
      // built from the payment id would be a fiction: it would look like a
      // second checkout for the same money and would leave the real one
      // unsettled.
      if (!event.providerCheckoutId) {
        return { status: "ignored" as const, reason: "No local checkout matched this payment." };
      }
      const existing = await prisma.payment.findUnique({ where: { providerCheckoutId: event.providerCheckoutId } });
      if (existing) {
        return existing.userId === userId
          ? { status: "processed" as const }
          : { status: "ignored" as const, reason: "That checkout belongs to another customer." };
      }
      if (await prisma.payment.findUnique({ where: { providerPaymentId } })) {
        return { status: "processed" as const };
      }
      await prisma.payment.create({
        data: {
          userId,
          provider: getProvider().name,
          providerPaymentId,
          providerCheckoutId: event.providerCheckoutId,
          providerCustomerReference: event.customerReference || customerReference(userId),
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
      return { status: "ignored" as const, reason: "The payment belongs to another customer." };
    }
    // An event that arrives before the payment settled cannot undo a settled
    // payment, and a settled payment is never moved back to pending.
    if (payment.settledEventAt && event.occurredAt < payment.settledEventAt) {
      return { status: "ignored" as const, reason: "An older event arrived after the payment settled." };
    }

    const planRow = payment.planId ? await prisma.plan.findUnique({ where: { id: payment.planId } }) : null;
    const plan = planRow ? toPlan(planRow) : null;
    if (plan?.recurring) {
      // A subscription is settled by its invoice, which also opens the
      // subscription and sets its period. A bare payment for it grants
      // nothing on its own.
      if (getProvider().name !== "local") {
        return { status: "ignored" as const, reason: "A subscription is settled by its invoice." };
      }
      // The local provider has no invoices of its own; a payment for a
      // recurring plan stands in for the subscription's first invoice.
      return this.applyInvoicePaid(userId, {
        ...event,
        type: "invoice.paid",
        providerInvoiceId: event.providerInvoiceId ?? `local_in_${payment.id}`,
        providerSubscriptionId: event.providerSubscriptionId ?? `local_sub_${payment.id}`,
        providerCheckoutId: payment.providerCheckoutId,
        billingReason: "subscription_create",
        planId: plan.id,
      });
    }

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: "pending" },
        data: { status: "succeeded", settledEventAt: event.occurredAt },
      });
      if (!claimed.count) return; // settled concurrently
      // The idempotency key ties the credit to the payment, so the ledger
      // records exactly one grant for it.
      await grantInTransaction(tx, userId, payment.credits, `payment:${payment.id}`, `Payment for ${payment.description}`, `payment:${payment.id}`);
      if (plan) await writeEntitlements(tx, userId, plan, `payment:${payment.id}`, { source: "payment", expiresAt: null });
    });

    return { status: "processed" as const };
  },

  /**
   * A subscription invoice was paid: the first period or a renewal.
   *
   * This is the only event that grants a subscription's credits and extends
   * its capabilities. Each invoice is one payment row (unique by invoice id),
   * and its credits carry that payment's idempotency key, so a repeated or
   * replayed invoice grants once. The entitlements expire at the end of the
   * paid period (plus a short grace), so a subscription that stops being paid
   * stops unlocking anything even if no cancellation event ever arrives.
   */
  async applyInvoicePaid(userId: string, event: ProviderEvent) {
    const providerSubscriptionId = event.providerSubscriptionId;
    const providerInvoiceId = event.providerInvoiceId;
    if (!providerSubscriptionId || !providerInvoiceId) {
      return { status: "ignored" as const, reason: "The invoice names no subscription." };
    }
    const provider = getProvider();
    const existingSubscription = await prisma.subscription.findUnique({ where: { providerSubscriptionId } });
    if (existingSubscription && existingSubscription.userId !== userId) {
      return { status: "ignored" as const, reason: "The subscription belongs to another customer." };
    }
    const planId = event.planId ?? existingSubscription?.planId;
    const planRow = planId ? await prisma.plan.findUnique({ where: { id: planId } }) : null;
    if (!planRow) return { status: "ignored" as const, reason: "The invoice names no known plan." };
    const plan = toPlan(planRow);

    const providerPaymentId =
      event.providerPaymentId ??
      (provider.paymentIntentForInvoice ? await provider.paymentIntentForInvoice(providerInvoiceId) : undefined);
    const periodEnd = event.currentPeriodEnd ?? new Date(event.occurredAt.getTime() + periodMs(plan));
    const renewal = event.billingReason === "subscription_cycle";

    return prisma.$transaction(async (tx) => {
      let payment = await tx.payment.findUnique({ where: { providerInvoiceId } });
      let grant = false;
      const paymentIdFree = async (ownId?: string) =>
        !!providerPaymentId && !(await tx.payment.findFirst({ where: { providerPaymentId, ...(ownId ? { id: { not: ownId } } : {}) } }));

      if (!payment) {
        // The first invoice settles the checkout that opened the subscription.
        // A renewal never does: it is a new payment of its own.
        const pending = renewal
          ? null
          : await tx.payment.findFirst({
              where: {
                userId,
                status: "pending",
                OR: [
                  ...(event.providerCheckoutId ? [{ providerCheckoutId: event.providerCheckoutId }] : []),
                  { providerSubscriptionId },
                  ...(existingSubscription ? [] : [{ planId: plan.id }]),
                ],
              },
              orderBy: { createdAt: "desc" },
            });
        if (pending) {
          const claimed = await tx.payment.updateMany({
            where: { id: pending.id, status: "pending" },
            data: {
              status: "succeeded",
              settledEventAt: event.occurredAt,
              providerInvoiceId,
              providerSubscriptionId,
              ...((await paymentIdFree(pending.id)) ? { providerPaymentId } : {}),
            },
          });
          payment = await tx.payment.findUniqueOrThrow({ where: { id: pending.id } });
          grant = claimed.count === 1;
        } else {
          payment = await tx.payment.create({
            data: {
              userId,
              planId: plan.id,
              provider: provider.name,
              providerPaymentId: (await paymentIdFree()) ? providerPaymentId! : `invoice_${providerInvoiceId}`,
              providerCheckoutId: providerInvoiceId,
              providerCustomerReference: customerReference(userId),
              providerInvoiceId,
              providerSubscriptionId,
              amountMinor: event.amountMinor ?? plan.priceMinor,
              currency: event.currency ?? plan.currency,
              status: "succeeded",
              credits: plan.credits,
              description: renewal ? `${plan.name} renewal` : `${plan.name} plan`,
              settledEventAt: event.occurredAt,
            },
          });
          grant = true;
        }
      }
      if (payment.userId !== userId) return { status: "ignored" as const, reason: "The invoice belongs to another customer." };

      if (grant) {
        await grantInTransaction(tx, userId, payment.credits, `payment:${payment.id}`, `Payment for ${payment.description}`, `payment:${payment.id}`);
      }

      // The paid period is the newest one seen; a late invoice never moves
      // the period end backwards.
      const currentPeriodEnd =
        existingSubscription?.currentPeriodEnd && existingSubscription.currentPeriodEnd > periodEnd
          ? existingSubscription.currentPeriodEnd
          : periodEnd;
      const subscription = await tx.subscription.upsert({
        where: { providerSubscriptionId },
        create: {
          userId,
          planId: plan.id,
          provider: provider.name,
          providerSubscriptionId,
          status: "active",
          currentPeriodEnd,
          lastEventAt: event.occurredAt,
        },
        update: {
          planId: plan.id,
          currentPeriodEnd,
          ...(existingSubscription?.status === "canceled" ? {} : { status: "active" }),
        },
      });

      const settledInFull = payment.status === "succeeded" || payment.status === "partially_refunded";
      if (subscription.status !== "canceled" && settledInFull && payment.disputeStatus !== "open" && payment.disputeStatus !== "lost") {
        const expiresAt = subscription.canceledAt ? currentPeriodEnd : new Date(currentPeriodEnd.getTime() + ENTITLEMENT_GRACE_MS);
        await writeEntitlements(tx, userId, plan, `subscription:${subscription.id}`, { source: "subscription", expiresAt });
      }
      return { status: "processed" as const };
    });
  },

  /**
   * A subscription invoice could not be paid.
   *
   * The subscription is marked past due. Its capabilities are not extended,
   * so they lapse when the paid period (and its grace) runs out unless a
   * retry succeeds and `invoice.paid` arrives.
   */
  async applyInvoiceFailed(userId: string, event: ProviderEvent) {
    if (!event.providerSubscriptionId) return { status: "ignored" as const, reason: "The invoice names no subscription." };
    const subscription = await prisma.subscription.findUnique({ where: { providerSubscriptionId: event.providerSubscriptionId } });
    if (!subscription || subscription.userId !== userId) {
      return { status: "ignored" as const, reason: "No local subscription matched this invoice." };
    }
    if (subscription.status === "canceled") return { status: "processed" as const };
    if (subscription.lastEventAt && event.occurredAt < subscription.lastEventAt) {
      return { status: "ignored" as const, reason: "An older event arrived after a newer one." };
    }
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "past_due", lastEventAt: event.occurredAt },
    });
    return { status: "processed" as const };
  },

  /** The local payment a refund or dispute names, whatever state it is in. */
  async paymentForEvent(userId: string, event: ProviderEvent) {
    const payment =
      (event.providerPaymentId ? await prisma.payment.findUnique({ where: { providerPaymentId: event.providerPaymentId } }) : null) ??
      (event.providerCheckoutId ? await prisma.payment.findUnique({ where: { providerCheckoutId: event.providerCheckoutId } }) : null) ??
      (event.providerInvoiceId ? await prisma.payment.findUnique({ where: { providerInvoiceId: event.providerInvoiceId } }) : null);
    if (!payment || payment.userId !== userId) return null;
    return payment;
  },

  /**
   * Takes credits back when a payment is refunded, in full or in part.
   *
   * The provider reports the cumulative amount refunded. The credits owed are
   * that share of the credits the payment granted, rounded down, less what
   * earlier refunds already accounted for — so a second partial refund takes
   * only the difference and a repeated or older refund takes nothing.
   *
   * Credits are taken only as far as the balance (read and locked inside the
   * transaction) allows; what was already spent is recorded on the payment as
   * a shortfall for an operator, and the wallet never goes negative.
   *
   * A full refund also withdraws every entitlement the payment produced and,
   * for a subscription, cancels it at the provider so it is not billed again.
   */
  async refundPayment(userId: string, event: ProviderEvent) {
    const payment = await this.paymentForEvent(userId, event);
    if (!payment) return { status: "ignored" as const, reason: "No local payment matched this refund." };
    if (payment.status === "pending" || payment.status === "failed") {
      return { status: "ignored" as const, reason: "The payment was never settled." };
    }

    const total = event.totalAmountMinor || payment.amountMinor;
    // A refund that does not say how much is a full refund.
    const reported = event.amountMinor === undefined || total <= 0 ? total : Math.min(event.amountMinor, total);
    if (reported <= 0 && total > 0) return { status: "ignored" as const, reason: "The refund names no amount." };
    const cumulative = Math.max(payment.refundedAmountMinor, reported);
    if (cumulative <= payment.refundedAmountMinor && payment.status !== "succeeded") {
      // Already accounted for (a repeat, or an older partial refund).
      return { status: "processed" as const };
    }
    const full = total <= 0 || cumulative >= total;
    const owedTotal = full ? payment.credits : Math.floor((payment.credits * cumulative) / total);
    const accounted = payment.refundedCredits + payment.refundShortfallCredits + payment.disputedCredits;
    const owed = Math.max(0, owedTotal - accounted);

    // The subscription is stopped first: if the provider cannot be reached the
    // event fails and is retried, and nothing has been written yet.
    if (full && payment.providerSubscriptionId) {
      await getProvider().cancelSubscription?.(payment.providerSubscriptionId, { atPeriodEnd: false });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Claimed on the refunded amount that was read, so two refund events
      // racing for the same payment cannot both take credits.
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, refundedAmountMinor: payment.refundedAmountMinor, status: payment.status },
        data: {
          status: full ? "refunded" : "partially_refunded",
          refundedAmountMinor: cumulative,
          refundedEventAt: event.occurredAt,
        },
      });
      if (!claimed.count) throw new Error("The payment changed while the refund was applied; retry.");

      const taken = await clawBackInTransaction(
        tx,
        userId,
        owed,
        `refund:${payment.id}:${cumulative}`,
        `${full ? "Refund" : "Partial refund"} for ${payment.description}`,
        `payment:${payment.id}`,
      );
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedCredits: { increment: taken.taken },
          refundShortfallCredits: { increment: taken.shortfall },
        },
      });

      if (full) {
        // Every capability the payment produced goes with a full refund: the
        // plan's own (source payment) and the subscription's.
        const sources = await entitlementSourcesOf(tx, payment);
        await tx.entitlement.deleteMany({ where: { userId, sourceId: { in: sources } } });
        if (payment.providerSubscriptionId) {
          await tx.subscription.updateMany({
            where: { providerSubscriptionId: payment.providerSubscriptionId, userId },
            data: { status: "canceled", canceledAt: event.occurredAt },
          });
        }
      }
      return taken;
    });

    if (result.shortfall > 0) {
      logger.warn({ userId, paymentId: payment.id, shortfall: result.shortfall }, "A refund took back fewer credits than the payment granted");
    }
    return { status: "processed" as const, shortfall: result.shortfall };
  },

  /**
   * A payment is disputed (a chargeback).
   *
   * The money is withdrawn while the dispute is open, so the disputed share of
   * the credits is taken back (as far as the balance allows) and the
   * capabilities the payment produced are withdrawn. A dispute that is won
   * restores both.
   */
  async disputePayment(userId: string, event: ProviderEvent) {
    const payment = await this.paymentForEvent(userId, event);
    if (!payment) return { status: "ignored" as const, reason: "No local payment matched this dispute." };
    if (payment.status === "pending" || payment.status === "failed") {
      return { status: "ignored" as const, reason: "The payment was never settled." };
    }
    if (payment.disputeStatus === "open" || payment.disputeStatus === "lost") return { status: "processed" as const };

    const total = event.totalAmountMinor || payment.amountMinor;
    const disputed = event.amountMinor === undefined || total <= 0 ? total : Math.min(event.amountMinor, total);
    const share = total <= 0 || disputed >= total ? payment.credits : Math.floor((payment.credits * disputed) / total);
    const owed = Math.max(0, share - payment.refundedCredits - payment.refundShortfallCredits);
    const disputeId = event.providerDisputeId ?? event.providerEventId;

    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, disputeStatus: payment.disputeStatus },
        data: { disputeStatus: "open", disputedEventAt: event.occurredAt },
      });
      if (!claimed.count) throw new Error("The payment changed while the dispute was applied; retry.");
      const taken = await clawBackInTransaction(tx, userId, owed, `dispute:${payment.id}:${disputeId}`, `Dispute on ${payment.description}`, `payment:${payment.id}`);
      await tx.payment.update({ where: { id: payment.id }, data: { disputedCredits: taken.taken } });
      const sources = await entitlementSourcesOf(tx, payment);
      await tx.entitlement.deleteMany({ where: { userId, sourceId: { in: sources } } });
      return taken;
    });
    if (result.shortfall > 0) {
      logger.warn({ userId, paymentId: payment.id, shortfall: result.shortfall }, "A dispute took back fewer credits than it covered");
    }
    return { status: "processed" as const, shortfall: result.shortfall };
  },

  /** A dispute closed. A won dispute restores what the dispute took; a lost one keeps it taken. */
  async closeDispute(userId: string, event: ProviderEvent) {
    const payment = await this.paymentForEvent(userId, event);
    if (!payment) return { status: "ignored" as const, reason: "No local payment matched this dispute." };
    if (payment.disputeStatus !== "open") return { status: "processed" as const };
    const won = event.disputeStatus === "won" || event.disputeStatus === "warning_closed";
    const disputeId = event.providerDisputeId ?? event.providerEventId;

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, disputeStatus: "open" },
        data: { disputeStatus: won ? "won" : "lost", disputedEventAt: event.occurredAt },
      });
      if (!claimed.count) return;
      if (!won) return;
      if (payment.disputedCredits > 0) {
        await grantInTransaction(tx, userId, payment.disputedCredits, `dispute-won:${payment.id}:${disputeId}`, `Dispute won on ${payment.description}`, `payment:${payment.id}`);
      }
      await tx.payment.update({ where: { id: payment.id }, data: { disputedCredits: 0 } });

      if (payment.status === "refunded") return;
      const planRow = payment.planId ? await tx.plan.findUnique({ where: { id: payment.planId } }) : null;
      if (!planRow) return;
      const plan = toPlan(planRow);
      if (!plan.recurring) {
        await writeEntitlements(tx, userId, plan, `payment:${payment.id}`, { source: "payment", expiresAt: null });
        return;
      }
      if (!payment.providerSubscriptionId) return;
      const subscription = await tx.subscription.findUnique({ where: { providerSubscriptionId: payment.providerSubscriptionId } });
      if (!subscription || !ACTIVE_STATUSES.includes(subscription.status as SubscriptionStatus)) return;
      if (!subscription.currentPeriodEnd || subscription.currentPeriodEnd.getTime() + ENTITLEMENT_GRACE_MS <= Date.now()) return;
      const expiresAt = subscription.canceledAt ? subscription.currentPeriodEnd : new Date(subscription.currentPeriodEnd.getTime() + ENTITLEMENT_GRACE_MS);
      await writeEntitlements(tx, userId, plan, `subscription:${subscription.id}`, { source: "subscription", expiresAt });
    });
    return { status: "processed" as const };
  },

  /**
   * Applies a subscription state change, keeping the newest state.
   *
   * A state change never grants or extends anything — only a paid invoice
   * does. It can shorten (a cancellation at period end), suspend (past due
   * keeps what was paid until it expires) or end the capabilities.
   */
  async applySubscriptionEvent(userId: string, event: ProviderEvent) {
    if (!event.providerSubscriptionId) return { status: "ignored" as const, reason: "The event names no subscription." };
    const existing = await prisma.subscription.findUnique({ where: { providerSubscriptionId: event.providerSubscriptionId } });
    if (existing && existing.userId !== userId) return { status: "ignored" as const, reason: "The subscription belongs to another customer." };
    if (existing && existing.lastEventAt && event.occurredAt < existing.lastEventAt) {
      // An older event must not overwrite a newer state.
      return { status: "ignored" as const, reason: "An older event arrived after a newer one." };
    }
    const planId = event.planId ?? existing?.planId;
    const planRow = planId ? await prisma.plan.findUnique({ where: { id: planId } }) : null;
    if (!planRow) return { status: "ignored" as const, reason: "The event names no known plan." };

    const ended = event.type === "subscription.canceled" || event.subscriptionStatus === "canceled";
    const status = (ended ? "canceled" : event.subscriptionStatus ?? existing?.status ?? "incomplete") as SubscriptionStatus;
    const canceledAt = ended
      ? existing?.canceledAt ?? event.occurredAt
      : event.cancelAtPeriodEnd === true
        ? existing?.canceledAt ?? event.occurredAt
        : event.cancelAtPeriodEnd === false
          ? null
          : existing?.canceledAt ?? null;
    // The period end only moves forward with a paid invoice; a state change
    // keeps the paid one when it has it.
    const currentPeriodEnd = existing?.currentPeriodEnd ?? null;

    await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.upsert({
        where: { providerSubscriptionId: event.providerSubscriptionId! },
        create: {
          userId,
          planId: planRow.id,
          provider: getProvider().name,
          providerSubscriptionId: event.providerSubscriptionId!,
          status,
          currentPeriodEnd: event.currentPeriodEnd ?? null,
          canceledAt,
          lastEventAt: event.occurredAt,
        },
        update: { status, canceledAt, lastEventAt: event.occurredAt },
      });
      const sourceId = `subscription:${subscription.id}`;
      if (status === "canceled" || status === "incomplete_expired" || (status as string) === "unpaid") {
        // A subscription that has ended no longer carries its plan's capabilities.
        await tx.entitlement.deleteMany({ where: { userId, source: "subscription", sourceId } });
      } else if (canceledAt && currentPeriodEnd) {
        // Set to end at the period end: the capabilities run until then, no longer.
        await tx.entitlement.updateMany({ where: { userId, source: "subscription", sourceId }, data: { expiresAt: currentPeriodEnd } });
      } else if (!canceledAt && existing?.canceledAt && currentPeriodEnd && ACTIVE_STATUSES.includes(status)) {
        // A cancellation was undone: the paid period's grace applies again.
        await tx.entitlement.updateMany({ where: { userId, source: "subscription", sourceId }, data: { expiresAt: new Date(currentPeriodEnd.getTime() + ENTITLEMENT_GRACE_MS) } });
      }
    });
    return { status: "processed" as const };
  },

  /**
   * Cancels the author's subscription. It runs to the end of its period.
   *
   * The provider is told first, so the subscription is not billed again; the
   * local record only changes once the provider has accepted it.
   */
  async cancelSubscription(userId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: "desc" },
    });
    if (!subscription) throw notFound("Subscription");
    if (subscription.canceledAt) return subscription;
    const now = new Date();
    const sourceId = `subscription:${subscription.id}`;
    const runsOn = !!subscription.currentPeriodEnd && subscription.currentPeriodEnd > now;

    await getProvider().cancelSubscription?.(subscription.providerSubscriptionId, { atPeriodEnd: runsOn });

    // The author has paid for the current period, so cancelling stops the
    // renewal and the plan runs until the period ends: the capabilities are
    // kept and set to expire then. Without a known period end there is
    // nothing left to run, so it ends now.
    if (runsOn) {
      return prisma.$transaction(async (tx) => {
        await tx.entitlement.updateMany({ where: { userId, source: "subscription", sourceId }, data: { expiresAt: subscription.currentPeriodEnd } });
        return tx.subscription.update({ where: { id: subscription.id }, data: { canceledAt: now } });
      });
    }
    return prisma.$transaction(async (tx) => {
      await tx.entitlement.deleteMany({ where: { userId, source: "subscription", sourceId } });
      return tx.subscription.update({ where: { id: subscription.id }, data: { status: "canceled", canceledAt: now } });
    });
  },

  /**
   * Synchronizes pending checkouts directly with the provider (e.g. Stripe).
   *
   * Only a checkout the provider reports as *paid* settles here. A session
   * that is merely `complete` may still be awaiting an asynchronous payment
   * (a bank debit, for one) that can still fail, so it grants nothing.
   */
  async syncPendingPayments(userId: string) {
    const provider = getProvider();
    if (provider.name !== "stripe" || !provider.fetchCheckoutSession) return;
    const pending = await prisma.payment.findMany({
      where: { userId, status: "pending" },
    });
    if (!pending.length) return;

    for (const p of pending) {
      if (!p.providerCheckoutId) continue;
      try {
        const remote = await provider.fetchCheckoutSession(p.providerCheckoutId);
        if (!remote || remote.paymentStatus !== "paid") continue;
        if (remote.mode === "subscription" || remote.subscriptionId) {
          if (!remote.subscriptionId || !remote.invoiceId) continue;
          const live = await provider.fetchSubscription(remote.subscriptionId);
          await this.applyEventBody({
            providerEventId: `sync_${p.providerCheckoutId}`,
            type: "invoice.paid",
            occurredAt: new Date(),
            customerReference: p.providerCustomerReference,
            providerCheckoutId: p.providerCheckoutId,
            providerPaymentId: remote.paymentIntentId,
            providerSubscriptionId: remote.subscriptionId,
            providerInvoiceId: remote.invoiceId,
            billingReason: "subscription_create",
            planId: p.planId ?? undefined,
            credits: p.credits,
            amountMinor: remote.amountTotal ?? p.amountMinor,
            currency: (remote.currency?.toUpperCase() as PaymentCurrency | undefined) ?? (p.currency as PaymentCurrency),
            currentPeriodEnd: live?.currentPeriodEnd ?? null,
          });
          continue;
        }
        if (!remote.paymentIntentId) continue;
        await this.applyEventBody({
          providerEventId: `sync_${p.providerCheckoutId}`,
          type: "payment.succeeded",
          occurredAt: new Date(),
          customerReference: p.providerCustomerReference,
          providerCheckoutId: p.providerCheckoutId,
          providerPaymentId: remote.paymentIntentId,
          planId: p.planId ?? undefined,
          credits: p.credits,
          amountMinor: remote.amountTotal ?? p.amountMinor,
          currency: (remote.currency?.toUpperCase() as PaymentCurrency | undefined) ?? (p.currency as PaymentCurrency),
        });
      } catch (err) {
        logger.warn({ err, checkoutId: p.providerCheckoutId }, "Failed to sync pending Stripe payment");
      }
    }
  },
  /** The author's billing state. */
  async state(userId: string) {
    await this.syncPendingPayments(userId).catch(() => undefined);
    const provider = getProvider();
    const [plans, subscription, allSubscriptions, entitlements, payments, wallet] = await Promise.all([
      this.plans(),
      prisma.subscription.findFirst({
        // A cancelled subscription is shown until its paid period ends.
        where: { userId, status: { in: ACTIVE_STATUSES }, OR: [{ canceledAt: null }, { currentPeriodEnd: { gt: new Date() } }] },
        orderBy: { createdAt: "desc" },
        include: { plan: true },
      }),
      prisma.subscription.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: { plan: true },
      }),
      prisma.entitlement.findMany({ where: { userId } }),
      prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50, include: { plan: true } }),
      creditService.getWallet(userId),
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
      currentPlan: subscription
        ? {
            id: subscription.planId,
            name: subscription.plan.name,
            description: subscription.plan.description,
            priceMinor: subscription.plan.priceMinor,
            currency: subscription.plan.currency as PaymentCurrency,
            status: subscription.status as SubscriptionStatus,
            recurring: true,
            credits: wallet.balance,
            interval: (subscription.planId.endsWith("-yearly") ? "year" : "month") as "year" | "month",
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
            canceledAt: subscription.canceledAt?.toISOString() ?? null,
          }
        : {
            id: "free",
            name: "Free Plan",
            description: "Standard author capabilities and welcome credits.",
            priceMinor: 0,
            currency: "USD" as PaymentCurrency,
            status: "active" as SubscriptionStatus,
            recurring: false,
            credits: wallet.balance,
            interval: "month" as const,
            currentPeriodEnd: null,
            canceledAt: null,
          },
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
      subscriptions: allSubscriptions.map((s) => ({
        id: s.id,
        planId: s.planId,
        planName: s.plan.name,
        status: s.status as SubscriptionStatus,
        currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
        canceledAt: s.canceledAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
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

/**
 * Writes the entitlements a plan carries.
 *
 * `expiresAt` is the end of what was paid for: a subscription's capabilities
 * expire with its period (and are extended by each paid renewal), a one-time
 * plan's never do.
 */
async function writeEntitlements(
  tx: Tx,
  userId: string,
  plan: Plan,
  sourceId: string,
  options: { source: "subscription" | "payment"; expiresAt: Date | null },
) {
  for (const [key, value] of Object.entries(plan.entitlements)) {
    await tx.entitlement.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, value: value as unknown as object, source: options.source, sourceId, expiresAt: options.expiresAt },
      update: { value: value as unknown as object, source: options.source, sourceId, expiresAt: options.expiresAt },
    });
  }
}
