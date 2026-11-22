import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  WEBHOOK_SIGNATURE_HEADER,
  signWebhook,
  type PaymentCurrency,
} from "@ebook/shared";
import { env } from "../../config/env.js";
import { StripeProvider } from "./stripeProvider.js";

/**
 * S12 payment provider boundary.
 *
 * The rest of the product talks to this interface and never to a provider
 * directly. That keeps the payment rules — what grants credits, what grants an
 * entitlement, what a refund does — in one place, and it means a real payment
 * processor can be added without touching the credit ledger.
 *
 * The local provider signs its webhooks with the same HMAC scheme a real
 * provider's would use, and the verification code below is the same code for
 * both. The local provider is a test harness, not a payment processor: it
 * cannot take money.
 */

/** What a checkout needs from the provider. */
export interface CheckoutRequest {
  /** The provider's identifier for the customer, when it knows one. */
  customerReference: string;
  planId: string;
  planName: string;
  amountMinor: number;
  currency: PaymentCurrency;
  credits: number;
  /** Where the author returns after paying. */
  returnUrl: string;
  /** The idempotency key for this checkout. */
  idempotencyKey: string;
  /**
   * Whether the plan renews. A recurring plan opens a real subscription at the
   * provider; a one-time plan (a credit pack) takes a single payment.
   */
  recurring?: boolean;
  /** The billing interval of a recurring plan. */
  interval?: "month" | "year";
  /** The provider's price for a recurring plan. Required by providers that bill subscriptions. */
  providerPriceId?: string | null;
}

/** What the provider gives back when a checkout is created. */
export interface CheckoutResult {
  /** The provider's identifier for this checkout. */
  providerCheckoutId: string;
  /**
   * The provider's identifier for the payment this checkout will produce.
   *
   * The provider names it now, before any money moves, so the settlement
   * event can be matched to the checkout it belongs to.
   */
  providerPaymentId: string;
  /** The provider's identifier for the customer, echoed back for the settlement event. */
  customerReference: string;
  /** Where the author completes the payment. */
  url: string;
}

/** An event the provider sends. */
export interface ProviderEvent {
  /** The provider's identifier for this event. A repeat delivery is a no-op. */
  providerEventId: string;
  type: string;
  /** When the provider says this happened. Used to reject out-of-order events. */
  occurredAt: Date;
  /** The provider's identifier for the customer. */
  customerReference: string;
  /** The provider's identifier for the payment, when the event is about one. */
  providerPaymentId?: string;
  /**
   * The provider's identifier for the checkout the payment belongs to.
   *
   * A checkout and a payment are different things and a provider names them
   * differently: a checkout session carries the session id, while the payment
   * event carries the payment intent id. The event has to carry both, because
   * the local record of a pending payment is written against the checkout that
   * was opened, and the payment that settles it is named by the other id.
   */
  providerCheckoutId?: string;
  /** The provider's identifier for the subscription, when the event is about one. */
  providerSubscriptionId?: string;
  /** The plan the payment bought. */
  planId?: string;
  /** The amount in the currency's minor unit. */
  amountMinor?: number;
  currency?: PaymentCurrency;
  /** The credits the payment granted. */
  credits?: number;
  /** The subscription state the event reports. */
  subscriptionStatus?: string;
  /** When the current period ends. */
  currentPeriodEnd?: Date | null;
  /** The provider's identifier for the invoice, for subscription invoice events. */
  providerInvoiceId?: string;
  /** Why the invoice was raised: `subscription_create` for the first period, `subscription_cycle` for a renewal. */
  billingReason?: string;
  /**
   * The total amount of the charge, for refund and dispute events, so a
   * partial refund can be measured against what was actually charged.
   * (`amountMinor` is the amount refunded or disputed.)
   */
  totalAmountMinor?: number;
  /** The provider's identifier for a dispute. */
  providerDisputeId?: string;
  /** The dispute's state: `won`, `lost`, or an open state. */
  disputeStatus?: string;
  /** Whether the subscription is set to end at the end of its period. */
  cancelAtPeriodEnd?: boolean;
}

/** The provider interface the product depends on. */
export interface PaymentProvider {
  /** The provider's name, recorded on every payment and event. */
  readonly name: string;
  /** Whether this provider can actually take money. */
  readonly live: boolean;
  /** The header a webhook's signature arrives in. */
  readonly signatureHeader: string;
  /** Creates a checkout the customer can pay at. */
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  /** Verifies a webhook signature and returns the event it carries. */
  verifyWebhook(rawBody: string, signature: string | undefined): ProviderEvent | null;
  /** The provider's current view of a subscription, for reconciliation. */
  fetchSubscription(providerSubscriptionId: string): Promise<{ status: string; currentPeriodEnd: Date | null } | null>;
  /** Fetches a checkout session directly from the provider, for syncing pending checkouts. */
  fetchCheckoutSession?(providerCheckoutId: string): Promise<{
    status: string | null;
    paymentStatus: string;
    mode?: string;
    paymentIntentId?: string;
    subscriptionId?: string;
    invoiceId?: string;
    amountTotal?: number | null;
    currency?: string | null;
  } | null>;
  /**
   * The checkout a payment belongs to, when the event did not name it.
   *
   * A provider may name a checkout and a payment differently, so an event may
   * carry only the payment. A provider that can look the checkout up answers
   * here; one that cannot returns nothing, and the event goes unmatched
   * rather than being credited to a guess.
   */
  resolveCheckoutSession?(providerPaymentId: string): Promise<string | undefined>;
  /**
   * Stops a subscription at the provider, so it is not billed again.
   *
   * `atPeriodEnd` lets the paid period run out; otherwise it ends now (a
   * refund). Cancelling a subscription that has already ended is not an error.
   */
  cancelSubscription?(providerSubscriptionId: string, options: { atPeriodEnd: boolean }): Promise<void>;
  /** The payment an invoice was paid with, when the invoice event did not name it. */
  paymentIntentForInvoice?(providerInvoiceId: string): Promise<string | undefined>;
}

/**
 * The local provider.
 *
 * It stands in for a payment processor in development and tests. It signs its
 * webhooks with the shared secret, so the production verification path is
 * exercised exactly as it would be with a real provider.
 */
export class LocalProvider implements PaymentProvider {
  readonly name = "local";
  readonly live = false;
  readonly signatureHeader = SIGNATURE_HEADER;

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    // The checkout id is derived from the idempotency key, so a repeated
    // request returns the same checkout instead of creating a second one.
    // A digest rather than a truncation: cutting the key short drops its tail
    // (the plan and attempt), so two different checkouts would share an id.
    const digest = createHash("sha256").update(request.idempotencyKey).digest("hex").slice(0, 32);
    const providerCheckoutId = `local_cs_${digest}`;
    // The payment id is derived the same way, so the settlement event names
    // the payment the checkout created.
    const providerPaymentId = `local_pay_${digest}`;
    const url = `${env.APP_URL}/app/credits/checkout?session=${providerCheckoutId}`;
    return { providerCheckoutId, providerPaymentId, customerReference: request.customerReference, url };
  }

  verifyWebhook(rawBody: string, signature: string | undefined): ProviderEvent | null {
    const parsed = parseEvent(rawBody);
    if (!parsed) return null;
    // The signature is verified by the caller against the raw body; here the
    // local provider only decodes the event.
    void signature;
    return parsed;
  }

  async fetchSubscription(providerSubscriptionId: string): Promise<{ status: string; currentPeriodEnd: Date | null } | null> {
    // The local provider holds no authoritative state of its own, so there is
    // nothing to reconcile against beyond what the webhook inbox recorded.
    void providerSubscriptionId;
    return null;
  }

  async fetchCheckoutSession(_providerCheckoutId: string) {
    return null;
  }

  async cancelSubscription(_providerSubscriptionId: string, _options: { atPeriodEnd: boolean }): Promise<void> {
    // The local provider bills nothing on its own, so there is nothing to stop.
  }

  /** Builds the webhook body this provider would send for an event. */
  static buildEvent(event: ProviderEvent): { body: string; signature: string; timestamp: number } {
    const body = JSON.stringify({
      id: event.providerEventId,
      type: event.type,
      occurred_at: event.occurredAt.getTime(),
      customer_reference: event.customerReference,
      provider_payment_id: event.providerPaymentId,
      provider_checkout_id: event.providerCheckoutId,
      provider_subscription_id: event.providerSubscriptionId,
      plan_id: event.planId,
      amount_minor: event.amountMinor,
      currency: event.currency,
      credits: event.credits,
      subscription_status: event.subscriptionStatus,
      current_period_end: event.currentPeriodEnd ? event.currentPeriodEnd.getTime() : null,
      provider_invoice_id: event.providerInvoiceId,
      billing_reason: event.billingReason,
      total_amount_minor: event.totalAmountMinor,
      provider_dispute_id: event.providerDisputeId,
      dispute_status: event.disputeStatus,
      cancel_at_period_end: event.cancelAtPeriodEnd,
    });
    const timestamp = Math.floor(Date.now() / 1000);
    return { body, signature: signWebhook(body, env.PAYMENT_WEBHOOK_SECRET, timestamp), timestamp };
  }
}

/** Decodes the local provider's event body. */
function parseEvent(rawBody: string): ProviderEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const body = parsed as Record<string, unknown>;
  if (typeof body.id !== "string" || typeof body.type !== "string" || typeof body.customer_reference !== "string") return null;
  const occurredAt = typeof body.occurred_at === "number" ? body.occurred_at : Date.now();
  return {
    providerEventId: body.id,
    type: body.type,
    occurredAt: new Date(occurredAt),
    customerReference: body.customer_reference,
    providerPaymentId: typeof body.provider_payment_id === "string" ? body.provider_payment_id : undefined,
    providerCheckoutId: typeof body.provider_checkout_id === "string" ? body.provider_checkout_id : undefined,
    providerSubscriptionId: typeof body.provider_subscription_id === "string" ? body.provider_subscription_id : undefined,
    planId: typeof body.plan_id === "string" ? body.plan_id : undefined,
    amountMinor: typeof body.amount_minor === "number" ? body.amount_minor : undefined,
    currency: typeof body.currency === "string" ? (body.currency as PaymentCurrency) : undefined,
    credits: typeof body.credits === "number" ? body.credits : undefined,
    subscriptionStatus: typeof body.subscription_status === "string" ? body.subscription_status : undefined,
    currentPeriodEnd: typeof body.current_period_end === "number" ? new Date(body.current_period_end) : null,
    providerInvoiceId: typeof body.provider_invoice_id === "string" ? body.provider_invoice_id : undefined,
    billingReason: typeof body.billing_reason === "string" ? body.billing_reason : undefined,
    totalAmountMinor: typeof body.total_amount_minor === "number" ? body.total_amount_minor : undefined,
    providerDisputeId: typeof body.provider_dispute_id === "string" ? body.provider_dispute_id : undefined,
    disputeStatus: typeof body.dispute_status === "string" ? body.dispute_status : undefined,
    cancelAtPeriodEnd: typeof body.cancel_at_period_end === "boolean" ? body.cancel_at_period_end : undefined,
  };
}

/** The provider this build talks to. */
export function getProvider(): PaymentProvider {
  // The processor is selected here, behind the same interface, with its own
  // secret and its own signature scheme. Nothing outside this file knows
  // which one is in use.
  if (env.PAYMENT_PROVIDER === "stripe") return new StripeProvider();
  return new LocalProvider();
}

/**
 * The customer reference the provider knows an author by.
 *
 * The provider uses this to say who paid; it is the only link between a
 * provider event and a local user.
 */
export function customerReference(userId: string): string {
  return `cus_${createHmac("sha256", env.PAYMENT_WEBHOOK_SECRET).update(userId).digest("hex").slice(0, 32)}`;
}

/** The signature header a provider's webhook carries. */
export const SIGNATURE_HEADER = WEBHOOK_SIGNATURE_HEADER;

/**
 * The header Stripe signs its webhooks with.
 *
 * Stripe uses its own scheme — `t=<timestamp>,v1=<hmac>` — verified by the
 * Stripe SDK against the endpoint's signing secret, so it does not use the
 * local provider's header or signature format.
 */
export const STRIPE_SIGNATURE_HEADER = "stripe-signature";

/** A random identifier for a local checkout. */
export function newLocalId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}
