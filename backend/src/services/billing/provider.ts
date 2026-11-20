import { createHmac, randomUUID } from "node:crypto";
import {
  WEBHOOK_SIGNATURE_HEADER,
  signWebhook,
  type PaymentCurrency,
} from "@ebook/shared";
import { env } from "../../config/env.js";

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
}

/** The provider interface the product depends on. */
export interface PaymentProvider {
  /** The provider's name, recorded on every payment and event. */
  readonly name: string;
  /** Whether this provider can actually take money. */
  readonly live: boolean;
  /** Creates a checkout the customer can pay at. */
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  /** Verifies a webhook signature and returns the event it carries. */
  verifyWebhook(rawBody: string, signature: string | undefined): ProviderEvent | null;
  /** The provider's current view of a subscription, for reconciliation. */
  fetchSubscription(providerSubscriptionId: string): Promise<{ status: string; currentPeriodEnd: Date | null } | null>;
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

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    // The checkout id is derived from the idempotency key, so a repeated
    // request returns the same checkout instead of creating a second one.
    const providerCheckoutId = `local_cs_${request.idempotencyKey.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40)}`;
    // The payment id is derived the same way, so the settlement event names
    // the payment the checkout created.
    const providerPaymentId = `local_pay_${request.idempotencyKey.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40)}`;
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

  /** Builds the webhook body this provider would send for an event. */
  static buildEvent(event: ProviderEvent): { body: string; signature: string; timestamp: number } {
    const body = JSON.stringify({
      id: event.providerEventId,
      type: event.type,
      occurred_at: event.occurredAt.getTime(),
      customer_reference: event.customerReference,
      provider_payment_id: event.providerPaymentId,
      provider_subscription_id: event.providerSubscriptionId,
      plan_id: event.planId,
      amount_minor: event.amountMinor,
      currency: event.currency,
      credits: event.credits,
      subscription_status: event.subscriptionStatus,
      current_period_end: event.currentPeriodEnd ? event.currentPeriodEnd.getTime() : null,
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
    providerSubscriptionId: typeof body.provider_subscription_id === "string" ? body.provider_subscription_id : undefined,
    planId: typeof body.plan_id === "string" ? body.plan_id : undefined,
    amountMinor: typeof body.amount_minor === "number" ? body.amount_minor : undefined,
    currency: typeof body.currency === "string" ? (body.currency as PaymentCurrency) : undefined,
    credits: typeof body.credits === "number" ? body.credits : undefined,
    subscriptionStatus: typeof body.subscription_status === "string" ? body.subscription_status : undefined,
    currentPeriodEnd: typeof body.current_period_end === "number" ? new Date(body.current_period_end) : null,
  };
}

/** The provider this build talks to. */
export function getProvider(): PaymentProvider {
  // There is one provider today. A real payment processor would be selected
  // here, behind the same interface, with its own secret and its own
  // signature scheme.
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

/** A random identifier for a local checkout. */
export function newLocalId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}
