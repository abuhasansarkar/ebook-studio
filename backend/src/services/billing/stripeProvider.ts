import Stripe from "stripe";
import { PAYMENT_CURRENCIES, type PaymentCurrency } from "@ebook/shared";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import type {
  CheckoutRequest,
  CheckoutResult,
  PaymentProvider,
  ProviderEvent,
} from "./provider.js";
import { STRIPE_SIGNATURE_HEADER } from "./provider.js";

/**
 * The Stripe payment provider.
 *
 * Stripe is the real processor behind the provider boundary. It is reached
 * through the same `PaymentProvider` interface the local provider implements, so
 * the rules that grant credits live in one place and a processor change never
 * reaches the credit ledger.
 *
 * Two things differ from the local provider and matter:
 *
 * - **Stripe signs its webhooks with the scheme `t=…,v1=…`**, computed over the
 *   raw request body and the timestamp, verified with the endpoint's signing
 *   secret. That is verified by the Stripe SDK, which also checks the timestamp
 *   against a tolerance, so a captured body cannot be replayed indefinitely.
 * - **A checkout session is not a payment.** The session tells us the customer
 *   reached the checkout page; only `payment_intent.succeeded` says the money
 *   moved. Credits are granted from the latter alone.
 */

/** The Stripe event types this product acts on. */
const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.paid",
]);

export class StripeProvider implements PaymentProvider {
  readonly name = "stripe";
  /** A Stripe test key is not a live processor; the key prefix decides. */
  readonly live = env.STRIPE_SECRET_KEY.startsWith("sk_live_");
  readonly signatureHeader = STRIPE_SIGNATURE_HEADER;

  private readonly client: Stripe;

  constructor() {
    this.client = new Stripe(env.STRIPE_SECRET_KEY, {
      // The SDK's own pinned version, so a Stripe release cannot change the
      // shape of the responses this code reads without the types changing too.
      apiVersion: Stripe.API_VERSION,      typescript: true,
      maxNetworkRetries: 2,
      timeout: 20_000,
    });
  }

  /**
   * Creates a Stripe Checkout session.
   *
   * The idempotency key is passed to Stripe, so a repeated request returns the
   * same session rather than creating a second one — the guarantee holds at the
   * processor, not only in this database.
   */
  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    // The session id is only known once Stripe has created the session, but
    // the payment intent's metadata must carry it so that the settled event
    // can be matched to this checkout. Stripe copies the session's metadata
    // onto the payment intent, and a session's own metadata cannot name the
    // session. So the checkout is opened with a placeholder and the session id
    // is written onto the intent once Stripe has issued it.
    const session = await this.client.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: undefined,
        client_reference_id: request.idempotencyKey,
        success_url: `${request.returnUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${request.returnUrl}?checkout=cancelled`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: request.currency.toLowerCase(),
              unit_amount: request.amountMinor,
              product_data: {
                name: request.planName,
                description: `${request.credits} credits`,
              },
            },
          },
        ],
        // The plan and the credit count ride along on the session, so the
        // settlement event can be matched to the plan it belongs to even if
        // the local payment record is missing.
        metadata: {
          planId: request.planId,
          credits: String(request.credits),
          customerReference: request.customerReference,
        },
        payment_intent_data: {
          metadata: {
            planId: request.planId,
            credits: String(request.credits),
            customerReference: request.customerReference,
          },
        },
      },
      { idempotencyKey: request.idempotencyKey },
    );

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");

    // The payment intent is the payment's identity, and Stripe creates it only
    // when the customer pays, so it is not known here. A placeholder is
    // recorded instead, and it is replaced by the real intent id when the
    // settled event arrives. The placeholder is distinct from the session id:
    // both columns are unique, and one row may not hold the same value in
    // both of them.
    const providerPaymentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : `pending_${session.id}`;

    // The session id is written onto the payment intent's metadata so that
    // the settled event carries it. Stripe does not do this on its own, and
    // without it the settled payment cannot be matched to the checkout that
    // was opened for it.
    await this.writeCheckoutIdOntoIntent(session);

    return {
      providerCheckoutId: session.id,
      providerPaymentId,
      customerReference: request.customerReference,
      url: session.url,
    };
  }

  /**
   * Writes the session id onto the session's payment intent.
   *
   * Stripe creates the payment intent for a session when the customer starts
   * paying, and it copies the session's metadata onto that intent — but the
   * session's metadata cannot name the session itself. The settled event
   * therefore names only the payment intent, and the local pending payment is
   * written against the session. Writing the session id onto the intent is
   * what lets the settled payment find the record it belongs to.
   *
   * The intent may not exist yet, and it may be created later, so this is
   * best effort: the checkout still works without it, and the session id is
   * also readable from the `checkout.session.completed` event.
   */
  private async writeCheckoutIdOntoIntent(session: Stripe.Checkout.Session): Promise<void> {
    if (typeof session.payment_intent !== "string") return;
    try {
      await this.client.paymentIntents.update(session.payment_intent, {
        metadata: { checkout_session_id: session.id },
      });
    } catch (err) {
      logger.warn(
        { reason: (err as Error).message, sessionId: session.id },
        "Could not record the checkout session on the payment intent",
      );
    }
  }

  /**
   * Verifies a Stripe webhook and converts it into the provider event.
   *
   * The SDK is given the raw body and the `stripe-signature` header; it
   * reconstructs the signed payload and compares it against the endpoint's
   * signing secret in constant time. A body that was altered in transit, or a
   * signature for a different body, is refused here and nothing downstream runs.
   */
  verifyWebhook(rawBody: string, signature: string | undefined): ProviderEvent | null {
    if (!signature) return null;
    let event: Stripe.Event;
    try {
      event = this.client.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      logger.warn({ reason: (err as Error).message }, "Refused a Stripe webhook with an invalid signature");
      return null;
    }
    if (!HANDLED_EVENTS.has(event.type)) {
      // An event this product does not act on is still delivered and recorded,
      // but it changes nothing.
      return {
        providerEventId: event.id,
        type: event.type,
        occurredAt: new Date(event.created * 1000),
        customerReference: customerRefFromMetadata(event),
        subscriptionStatus: undefined,
      };
    }
    return this.toProviderEvent(event);
  }

  /** Converts a Stripe event into the provider-neutral event. */
  private toProviderEvent(event: Stripe.Event): ProviderEvent {
    const object = event.data.object as Stripe.Checkout.Session | Stripe.PaymentIntent | Stripe.Charge | Stripe.Subscription;
    const base = {
      providerEventId: event.id,
      occurredAt: new Date(event.created * 1000),
    };

    if (event.type === "checkout.session.completed") {
      const session = object as Stripe.Checkout.Session;
      return {
        ...base,
        type: "checkout.completed",
        customerReference: session.metadata?.customerReference ?? customerRefFromMetadata(event),
        providerCheckoutId: session.id,
        providerPaymentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
        planId: session.metadata?.planId,
        credits: session.metadata?.credits ? Number(session.metadata.credits) : undefined,
        amountMinor: session.amount_total ?? undefined,
        currency: toCurrency(session.currency),
      };
    }

    if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
      const intent = object as Stripe.PaymentIntent;
      return {
        ...base,
        type: event.type === "payment_intent.succeeded" ? "payment.succeeded" : "payment.failed",
        customerReference: intent.metadata?.customerReference ?? customerRefFromMetadata(event),
        providerPaymentId: intent.id,
        // The checkout session this intent belongs to, read from the session
        // the intent was created for. The local pending payment is written
        // against that session, so this is what lets the settled payment find
        // the record it belongs to.
        providerCheckoutId: checkoutSessionIdOf(intent),
        planId: intent.metadata?.planId,
        credits: intent.metadata?.credits ? Number(intent.metadata.credits) : undefined,
        amountMinor: intent.amount_received || intent.amount,
        currency: toCurrency(intent.currency),
      };
    }

    if (event.type === "charge.refunded") {
      const charge = object as Stripe.Charge;
      const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      return {
        ...base,
        type: "payment.refunded",
        customerReference: customerRefFromMetadata(event),
        providerPaymentId: intent,
        providerCheckoutId: charge.metadata?.checkout_session_id ?? charge.metadata?.checkout_session,
        amountMinor: charge.amount_refunded,
        currency: toCurrency(charge.currency),
      };
    }

    if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
      const invoice = event.data.object as any;
      const intent = typeof invoice.payment_intent === "string" ? invoice.payment_intent : undefined;
      const subId = typeof invoice.subscription === "string" ? invoice.subscription : undefined;
      return {
        ...base,
        type: "payment.succeeded",
        customerReference: invoice.metadata?.customerReference ?? customerRefFromMetadata(event),
        providerPaymentId: intent,
        providerSubscriptionId: subId,
        planId: invoice.metadata?.planId,
        credits: invoice.metadata?.credits ? Number(invoice.metadata.credits) : undefined,
        amountMinor: invoice.amount_paid ?? invoice.amount_due,
        currency: toCurrency(invoice.currency),
      };
    }

    const subscription = object as Stripe.Subscription;
    const status = subscription.status;
    return {
      ...base,
      type: event.type === "customer.subscription.deleted" ? "subscription.canceled" : "subscription.updated",
      customerReference: subscription.metadata?.customerReference ?? customerRefFromMetadata(event),
      providerSubscriptionId: subscription.id,
      planId: subscription.metadata?.planId,
      credits: subscription.metadata?.credits ? Number(subscription.metadata.credits) : undefined,
      subscriptionStatus: status,
      currentPeriodEnd: periodEnd(subscription),
    };
  }

  /**
   * The checkout session a payment intent belongs to.
   *
   * Stripe creates the payment intent for a session when the customer starts
   * paying, and copies the session's metadata onto it. The session's metadata
   * cannot name the session itself, so the intent usually does not carry the
   * session id, and the settled event names only the intent.
   *
   * The session is therefore asked of Stripe directly. Listing the sessions
   * that reference the intent is the one lookup that works both for an intent
   * Stripe created for a session and for one created before the session was
   * paid. A lookup that fails leaves the event unmatched rather than
   * guessing, so a payment is never credited to the wrong checkout.
   */
  async resolveCheckoutSession(providerPaymentId: string): Promise<string | undefined> {
    if (!providerPaymentId) return undefined;
    try {
      const sessions = await this.client.checkout.sessions.list({
        payment_intent: providerPaymentId,
        limit: 1,
      });
      return sessions.data[0]?.id;
    } catch (err) {
      logger.warn(
        { reason: (err as Error).message, providerPaymentId },
        "Could not read the checkout session for a payment",
      );
      return undefined;
    }
  }

  /**
   * The provider's current view of a subscription.
   *
   * This is what reconciliation compares the local record against, so a
   * subscription that changed while a webhook was missed is still caught.
   */
  async fetchSubscription(providerSubscriptionId: string): Promise<{ status: string; currentPeriodEnd: Date | null } | null> {
    try {
      const subscription = await this.client.subscriptions.retrieve(providerSubscriptionId);
      return { status: subscription.status, currentPeriodEnd: periodEnd(subscription) };
    } catch (err) {
      const code = (err as { code?: string }).code;
      // A subscription that no longer exists is not an error; it is a fact.
      if (code === "resource_missing") return null;
      throw err;
    }
  }

  /**
   * Finds the Stripe customer for an author, creating one when needed.
   *
   * The author's user id is stored as the customer's metadata, so the mapping
   * survives a deleted customer and a reinstalled database.
   */
  async findOrCreateCustomer(userId: string, email: string | null): Promise<string> {
    const search = await this.client.customers.search({
      query: `metadata['userId']:'${userId}'`,
      limit: 1,
    });
    const existing = search.data[0];
    if (existing) return existing.id;
    const created = await this.client.customers.create({
      ...(email ? { email } : {}),
      metadata: { userId },
    });
    return created.id;
  }
}

/** The period end of a Stripe subscription, across API shape changes. */
function periodEnd(subscription: Stripe.Subscription): Date | null {
  const item = subscription.items?.data?.[0];
  const end = item?.current_period_end ?? (subscription as unknown as { current_period_end?: number }).current_period_end;
  return typeof end === "number" ? new Date(end * 1000) : null;
}

/** The customer reference carried on an event's metadata. */
function customerRefFromMetadata(event: Stripe.Event): string {
  const data = event.data.object as { metadata?: Record<string, string> | null };
  return data.metadata?.customerReference ?? "";
}

/**
 * The checkout session a payment intent belongs to.
 *
 * Stripe creates the payment intent for a checkout session, and the event
 * about that intent names only the intent. The session identifier is written
 * onto the intent's metadata when the checkout is opened, so it can be read
 * back here. Without it the settled payment cannot be matched to the pending
 * record of the checkout that was opened.
 */
function checkoutSessionIdOf(intent: Stripe.PaymentIntent): string | undefined {
  const metadata = intent.metadata as Record<string, string> | null | undefined;
  const fromMetadata = metadata?.checkout_session_id;
  if (fromMetadata) return fromMetadata;

  // A payment intent created for a session carries the session in the intent's
  // own metadata under Stripe's own key.
  const stripeKey = metadata?.checkout_session;
  return stripeKey || undefined;
}

/**
 * The currency of an amount, narrowed to the currencies this product sells in.
 *
 * Stripe reports a currency in lower case. A currency this product does not
 * sell in is refused rather than guessed at, so a payment in an unexpected
 * currency cannot be recorded as one of ours.
 */
function toCurrency(currency: string | null | undefined): PaymentCurrency | undefined {
  if (!currency) return undefined;
  const upper = currency.toUpperCase();
  return (PAYMENT_CURRENCIES as readonly string[]).includes(upper)
    ? (upper as PaymentCurrency)
    : undefined;
}
