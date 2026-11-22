import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { StripeProvider } from "../src/services/billing/stripeProvider.js";

/**
 * The Stripe provider.
 *
 * These tests never reach the Stripe API. They cover the two things that
 * decide whether money is granted: the signature verification and the mapping
 * from a Stripe event to the provider-neutral event the credit ledger
 * understands.
 *
 * The signature cases are the important ones. A webhook that was altered in
 * transit, or signed for a different body, must be refused â€” and refused
 * without the payload being parsed, so nothing downstream runs.
 */

/** The secret the provider verifies against, the same one the tests sign with. */
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_test_secret";

/** Builds a signed webhook the way Stripe does. */
function signed(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const crypto = require("node:crypto") as typeof import("node:crypto");
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${expected}`;
}

describe("the Stripe provider", () => {
  it("reports that a test key is not a live processor", () => {
    // The key in the test environment is a test key, so the provider reports
    // that it cannot take real money. This is what the billing screen shows.
    expect(new StripeProvider().live).toBe(false);
  });

  it("names itself stripe", () => {
    expect(new StripeProvider().name).toBe("stripe");
  });

  it("signs webhooks with its own header, not the local provider's", () => {
    expect(new StripeProvider().signatureHeader).toBe("stripe-signature");
  });

  it("refuses a webhook with no signature", () => {
    const provider = new StripeProvider();
    expect(provider.verifyWebhook(JSON.stringify({ id: "evt_1" }), undefined)).toBeNull();
  });

  it("refuses a webhook whose signature does not match the body", () => {
    const provider = new StripeProvider();
    const secret = SECRET;
    const body = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded" });
    const signature = signed(body, "a-different-secret");
    // The body is intact but the signature was made with another secret, so
    // the event cannot be vouched for.
    expect(provider.verifyWebhook(body, signature)).toBeNull();
  });

  it("refuses a webhook whose body was altered after signing", () => {
    const provider = new StripeProvider();
    const secret = SECRET;
    const original = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded" });
    const signature = signed(original, secret);
    const tampered = original.replace("payment_intent.succeeded", "payment_intent.payment_failed");
    expect(provider.verifyWebhook(tampered, signature)).toBeNull();
  });

  it("refuses a signature that is not in Stripe's scheme", () => {
    const provider = new StripeProvider();
    const body = JSON.stringify({ id: "evt_1" });
    // The local provider's scheme is not Stripe's, so it cannot pass here.
    expect(provider.verifyWebhook(body, "v1=abcdef0123456789")).toBeNull();
  });

  it("maps a settled payment intent to the credit-granting event", () => {
    const provider = new StripeProvider();
    const body = JSON.stringify({
      id: "evt_settled",
      type: "payment_intent.succeeded",
      created: 1_700_000_000,
      data: {
        object: {
          id: "pi_1",
          amount: 1200,
          amount_received: 1200,
          currency: "usd",
          metadata: { planId: "starter", credits: "500", customerReference: "cus_abc" },
        },
      },
    });
    const event = provider.verifyWebhook(body, signed(body, SECRET));
    expect(event).toBeTruthy();
    expect(event!.type).toBe("payment.succeeded");
    expect(event!.providerEventId).toBe("evt_settled");
    expect(event!.providerPaymentId).toBe("pi_1");
    expect(event!.planId).toBe("starter");
    expect(event!.credits).toBe(500);
    expect(event!.amountMinor).toBe(1200);
    expect(event!.currency).toBe("USD");
    expect(event!.customerReference).toBe("cus_abc");
  });

  it("maps a failed payment intent to a failure that grants nothing", () => {
    const provider = new StripeProvider();
    const body = JSON.stringify({
      id: "evt_failed",
      type: "payment_intent.payment_failed",
      created: 1_700_000_000,
      data: { object: { id: "pi_2", amount: 1200, currency: "usd", metadata: { planId: "starter", credits: "500" } } },
    });
    const event = provider.verifyWebhook(body, signed(body, SECRET));
    expect(event!.type).toBe("payment.failed");
  });

  /**
   * Stripe names a checkout and a payment differently. The pending record is
   * written against the checkout session, and the settled event names the
   * payment intent, so the event has to carry the session as well. Without it
   * a genuine payment can never be matched to the checkout that bought it.
   *
   * The session id reaches the intent in one of two ways: Stripe copies it
   * from the session's metadata, or the product writes it onto the intent when
   * the checkout is opened. Both are read.
   */
  it("carries the checkout session on a settled payment event", () => {
    const provider = new StripeProvider();
    const body = JSON.stringify({
      id: "evt_with_session",
      type: "payment_intent.succeeded",
      created: 1_700_000_000,
      data: {
        object: {
          id: "pi_1",
          amount: 1200,
          amount_received: 1200,
          currency: "usd",
          metadata: {
            planId: "starter",
            credits: "500",
            customerReference: "cus_abc",
            // Stripe writes the session id onto the intent it creates.
            checkout_session: "cs_test_abc",
          },
        },
      },
    });
    const event = provider.verifyWebhook(body, signed(body, SECRET));
    expect(event!.providerPaymentId).toBe("pi_1");
    expect(event!.providerCheckoutId).toBe("cs_test_abc");
  });

  /**
   * Stripe does not put the session id on the intent on its own: a session's
   * metadata cannot name the session, and Stripe copies that metadata onto the
   * intent. The product writes the session id onto the intent when it opens
   * the checkout, and this is the key it writes.
   */
  it("carries the checkout session written onto the intent by the product", () => {
    const provider = new StripeProvider();
    const body = JSON.stringify({
      id: "evt_with_written_session",
      type: "payment_intent.succeeded",
      created: 1_700_000_000,
      data: {
        object: {
          id: "pi_written",
          amount: 1200,
          amount_received: 1200,
          currency: "usd",
          metadata: {
            planId: "starter",
            credits: "500",
            customerReference: "cus_abc",
            checkout_session_id: "cs_test_written",
          },
        },
      },
    });
    const event = provider.verifyWebhook(body, signed(body, SECRET));
    expect(event!.providerCheckoutId).toBe("cs_test_written");
    expect(event!.providerPaymentId).toBe("pi_written");
  });

  it("carries the checkout session on a completed checkout event", () => {
    const provider = new StripeProvider();
    const body = JSON.stringify({
      id: "evt_session",
      type: "checkout.session.completed",
      created: 1_700_000_000,
      data: {
        object: {
          id: "cs_test_xyz",
          payment_intent: "pi_9",
          amount_total: 1200,
          currency: "usd",
          metadata: { planId: "starter", credits: "500" },
        },
      },
    });
    const event = provider.verifyWebhook(body, signed(body, SECRET));
    expect(event!.providerCheckoutId).toBe("cs_test_xyz");
    expect(event!.providerPaymentId).toBe("pi_9");
  });

  it("maps a completed checkout session to an event that grants nothing", () => {
    const provider = new StripeProvider();
    const body = JSON.stringify({
      id: "evt_checkout",
      type: "checkout.session.completed",
      created: 1_700_000_000,
      data: {
        object: {
          id: "cs_1",
          payment_intent: "pi_3",
          amount_total: 1200,
          currency: "usd",
          metadata: { planId: "starter", credits: "500", customerReference: "cus_abc" },
        },
      },
    });
    const event = provider.verifyWebhook(body, signed(body, SECRET));
    expect(event!.type).toBe("checkout.completed");
    // The credits are carried so the plan can be named, but the type is not
    // one that grants anything.
    expect(event!.type).not.toBe("payment.succeeded");
  });

  it("maps a refund to the refund event", () => {
    const provider = new StripeProvider();
    const body = JSON.stringify({
      id: "evt_refund",
      type: "charge.refunded",
      created: 1_700_000_000,
      data: {
        object: { id: "ch_1", payment_intent: "pi_4", amount_refunded: 1200, currency: "usd", metadata: {} },
      },
    });
    const event = provider.verifyWebhook(body, signed(body, SECRET));
    expect(event!.type).toBe("payment.refunded");
    expect(event!.providerPaymentId).toBe("pi_4");
    expect(event!.amountMinor).toBe(1200);
  });

  it("maps a cancelled subscription to the cancellation event", () => {
    const provider = new StripeProvider();
    const body = JSON.stringify({
      id: "evt_cancel",
      type: "customer.subscription.deleted",
      created: 1_700_000_000,
      data: {
        object: {
          id: "sub_1",
          status: "canceled",
          metadata: { planId: "author", credits: "2000" },
          items: { data: [{ current_period_end: 1_800_000_000 }] },
        },
      },
    });
    const event = provider.verifyWebhook(body, signed(body, SECRET));
    expect(event!.type).toBe("subscription.canceled");
    expect(event!.subscriptionStatus).toBe("canceled");
    expect(event!.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it("refuses a currency this product does not sell in", () => {
    const provider = new StripeProvider();
    const body = JSON.stringify({
      id: "evt_jpy",
      type: "payment_intent.succeeded",
      created: 1_700_000_000,
      data: {
        object: {
          id: "pi_5",
          amount: 1200,
          amount_received: 1200,
          currency: "jpy",
          metadata: { planId: "starter", credits: "500" },
        },
      },
    });
    const event = provider.verifyWebhook(body, signed(body, SECRET));
    // The currency is not one of USD/EUR/GBP, so it is not narrowed to one.
    expect(event!.currency).toBeUndefined();
  });

  /**
   * A settled event names the payment, and the pending record is written
   * against the checkout. The provider can be asked which checkout a payment
   * belongs to, and the answer is what lets the two be matched.
   *
   * These tests never reach Stripe's API, so the lookup is exercised through a
   * stubbed client: the point is the shape of the answer and what happens
   * when the lookup fails.
   */
  describe("finding the checkout a payment belongs to", () => {
    it("answers with the checkout Stripe reports for the payment", async () => {
      const provider = new StripeProvider();
      (provider as unknown as { client: unknown }).client = {
        checkout: {
          sessions: {
            list: async (args: { payment_intent: string; limit: number }) => {
              expect(args.payment_intent).toBe("pi_known");
              expect(args.limit).toBe(1);
              return { data: [{ id: "cs_known" }] };
            },
          },
        },
      };
      await expect(provider.resolveCheckoutSession("pi_known")).resolves.toBe("cs_known");
    });

    it("answers with nothing when no checkout claims the payment", async () => {
      const provider = new StripeProvider();
      (provider as unknown as { client: unknown }).client = {
        checkout: { sessions: { list: async () => ({ data: [] }) } },
      };
      await expect(provider.resolveCheckoutSession("pi_orphan")).resolves.toBeUndefined();
    });

    /**
     * A failed lookup must leave the event unmatched rather than guess. A
     * payment credited to the wrong checkout is worse than a payment that is
     * not credited yet.
     */
    it("answers with nothing when the lookup fails", async () => {
      const provider = new StripeProvider();
      (provider as unknown as { client: unknown }).client = {
        checkout: {
          sessions: {
            list: async () => {
              throw new Error("Stripe is unreachable");
            },
          },
        },
      };
      await expect(provider.resolveCheckoutSession("pi_unreachable")).resolves.toBeUndefined();
    });

    it("answers with nothing when the payment is not named", async () => {
      const provider = new StripeProvider();
      await expect(provider.resolveCheckoutSession("")).resolves.toBeUndefined();
    });
  });

  describe("subscriptions, partial refunds and disputes", () => {
    const request = {
      customerReference: "cus_ref",
      planId: "author",
      planName: "Author Pro",
      amountMinor: 4900,
      currency: "USD" as const,
      credits: 750,
      returnUrl: "http://localhost:3000/app/credits",
      idempotencyKey: "checkout:u:author:1",
    };

    it("opens a recurring plan as a Stripe subscription against its price", async () => {
      const provider = new StripeProvider();
      let args: any;
      (provider as unknown as { client: unknown }).client = {
        checkout: { sessions: { create: async (a: unknown) => { args = a; return { id: "cs_sub", url: "https://stripe/cs_sub", payment_intent: null }; } } },
      };
      const result = await provider.createCheckout({ ...request, recurring: true, interval: "month", providerPriceId: "price_author" });
      expect(args.mode).toBe("subscription");
      expect(args.line_items).toEqual([{ price: "price_author", quantity: 1 }]);
      expect(args.subscription_data.metadata).toMatchObject({ planId: "author", customerReference: "cus_ref" });
      expect(args.payment_intent_data).toBeUndefined();
      expect(result.providerPaymentId).toBe("pending_cs_sub");
    });

    it("refuses a recurring plan with no Stripe price rather than charging once", async () => {
      const provider = new StripeProvider();
      (provider as unknown as { client: unknown }).client = { checkout: { sessions: { create: async () => { throw new Error("must not be called"); } } } };
      await expect(provider.createCheckout({ ...request, recurring: true, providerPriceId: null })).rejects.toThrow(/no Stripe price/);
    });

    it("keeps a credit pack a one-time payment", async () => {
      const provider = new StripeProvider();
      let args: any;
      (provider as unknown as { client: unknown }).client = {
        checkout: { sessions: { create: async (a: unknown) => { args = a; return { id: "cs_pack", url: "https://stripe/cs_pack", payment_intent: null }; } } },
      };
      await provider.createCheckout({ ...request, recurring: false });
      expect(args.mode).toBe("payment");
    });

    it("maps a paid invoice (current API shape) to the renewal event", () => {
      const provider = new StripeProvider();
      const body = JSON.stringify({
        id: "evt_invoice", type: "invoice.paid", created: 1_700_000_000,
        data: { object: {
          id: "in_1", billing_reason: "subscription_cycle", amount_paid: 4900, currency: "usd",
          parent: { subscription_details: { subscription: "sub_9", metadata: { planId: "author", credits: "750", customerReference: "cus_ref" } } },
          payments: { data: [{ payment: { type: "payment_intent", payment_intent: "pi_inv" } }] },
          lines: { data: [{ period: { start: 1_700_000_000, end: 1_702_592_000 } }] },
        } },
      });
      const event = provider.verifyWebhook(body, signed(body, SECRET))!;
      expect(event.type).toBe("invoice.paid");
      expect(event.providerInvoiceId).toBe("in_1");
      expect(event.providerSubscriptionId).toBe("sub_9");
      expect(event.providerPaymentId).toBe("pi_inv");
      expect(event.billingReason).toBe("subscription_cycle");
      expect(event.planId).toBe("author");
      expect(event.customerReference).toBe("cus_ref");
      expect(event.currentPeriodEnd?.getTime()).toBe(1_702_592_000 * 1000);
    });

    it("maps a failed invoice and ignores the duplicate invoice.payment_succeeded", () => {
      const provider = new StripeProvider();
      const failed = JSON.stringify({ id: "evt_inv_failed", type: "invoice.payment_failed", created: 1_700_000_000, data: { object: { id: "in_2", subscription: "sub_old_shape", metadata: {} } } });
      const event = provider.verifyWebhook(failed, signed(failed, SECRET))!;
      expect(event.type).toBe("invoice.payment_failed");
      expect(event.providerSubscriptionId).toBe("sub_old_shape");

      const dup = JSON.stringify({ id: "evt_inv_dup", type: "invoice.payment_succeeded", created: 1_700_000_000, data: { object: { id: "in_3", metadata: {} } } });
      expect(provider.verifyWebhook(dup, signed(dup, SECRET))!.type).toBe("invoice.payment_succeeded");
    });

    it("reports how much of the charge a refund covers", () => {
      const provider = new StripeProvider();
      const body = JSON.stringify({ id: "evt_partial", type: "charge.refunded", created: 1_700_000_000, data: { object: { id: "ch_2", payment_intent: "pi_7", amount: 4900, amount_refunded: 1000, currency: "usd", metadata: {} } } });
      const event = provider.verifyWebhook(body, signed(body, SECRET))!;
      expect(event.amountMinor).toBe(1000);
      expect(event.totalAmountMinor).toBe(4900);
    });

    it("maps disputes opening and closing", () => {
      const provider = new StripeProvider();
      const opened = JSON.stringify({ id: "evt_dp", type: "charge.dispute.created", created: 1_700_000_000, data: { object: { id: "dp_1", charge: "ch_3", payment_intent: "pi_8", amount: 4900, currency: "usd", status: "needs_response", reason: "fraudulent" } } });
      const a = provider.verifyWebhook(opened, signed(opened, SECRET))!;
      expect(a).toMatchObject({ type: "payment.disputed", providerPaymentId: "pi_8", providerDisputeId: "dp_1", amountMinor: 4900 });
      const closed = JSON.stringify({ id: "evt_dp_closed", type: "charge.dispute.closed", created: 1_700_000_100, data: { object: { id: "dp_1", charge: "ch_3", payment_intent: "pi_8", amount: 4900, currency: "usd", status: "won", reason: "fraudulent" } } });
      expect(provider.verifyWebhook(closed, signed(closed, SECRET))).toMatchObject({ type: "payment.dispute_closed", disputeStatus: "won" });
    });

    it("cancels at period end or immediately, and treats a missing subscription as cancelled", async () => {
      const provider = new StripeProvider();
      const calls: string[] = [];
      (provider as unknown as { client: unknown }).client = {
        subscriptions: {
          update: async (id: string, params: { cancel_at_period_end: boolean }) => { calls.push(`update:${id}:${params.cancel_at_period_end}`); },
          cancel: async (id: string) => { calls.push(`cancel:${id}`); if (id === "sub_gone") throw Object.assign(new Error("No such subscription"), { code: "resource_missing" }); },
        },
      };
      await provider.cancelSubscription("sub_a", { atPeriodEnd: true });
      await provider.cancelSubscription("sub_b", { atPeriodEnd: false });
      await provider.cancelSubscription("sub_gone", { atPeriodEnd: false });
      expect(calls).toEqual(["update:sub_a:true", "cancel:sub_b", "cancel:sub_gone"]);
    });
  });
});
