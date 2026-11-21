import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signWebhook, type Plan } from '@ebook/shared';
import { prisma } from '../src/database/prisma.js';
import { closeQueues } from '../src/queues/index.js';
import { env } from '../src/config/env.js';
import { billingService } from '../src/services/billing/billingService.js';
import { customerReference, getProvider, SIGNATURE_HEADER } from '../src/services/billing/provider.js';
import { createUser, ORIGIN } from './helpers.js';

afterAll(async () => { await closeQueues(); await prisma.$disconnect(); });

/**
 * S12 paid plans integration tests.
 *
 * These cover the rule the package exists for: only verified payment state
 * grants entitlements, and the credit balance reconciles with the ledger.
 */

const PLAN: Plan = {
  id: 'test-plan',
  name: 'Test plan',
  description: 'A plan for the tests.',
  priceMinor: 1200,
  currency: 'USD',
  credits: 500,
  entitlements: { maxBooks: 5, maxChaptersPerBook: 30 },
  active: true,
  recurring: false,
};

/**
 * The provider's identifier for a payment.
 *
 * The provider names the payment when the checkout is created, so a
 * settlement event can be matched to the record it belongs to.
 */
async function paymentProviderId(paymentId: string): Promise<string> {
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  return payment.providerPaymentId;
}

/** Creates a plan, replacing any plan left behind by an earlier run. */
async function createPlan(id: string, active: boolean) {
  await prisma.plan.deleteMany({ where: { id } });
  await prisma.plan.create({ data: { id, name: id, priceMinor: 100, credits: 1, active } });
}
/** Sends a signed webhook to the API, exactly as a provider would. */
function sendWebhook(body: string, options: { secret?: string; timestamp?: number } = {}) {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = signWebhook(body, options.secret ?? env.PAYMENT_WEBHOOK_SECRET, timestamp);
  return getAgent().post('/api/v1/billing/webhook').set(SIGNATURE_HEADER, signature).set('x-ebookstudio-timestamp', String(timestamp)).set('Content-Type', 'application/json').send(body);
}

/** A signed webhook for one event. */
function eventBody(event: {
  id: string;
  type: string;
  customerReference: string;
  providerPaymentId?: string;
  providerCheckoutId?: string;
  planId?: string;
  amountMinor?: number;
  credits?: number;
  occurredAt?: number;
  subscriptionStatus?: string;
  providerSubscriptionId?: string;
}) {
  return JSON.stringify({
    id: event.id,
    type: event.type,
    occurred_at: event.occurredAt ?? Date.now(),
    customer_reference: event.customerReference,
    provider_payment_id: event.providerPaymentId,
    provider_checkout_id: event.providerCheckoutId,
    provider_subscription_id: event.providerSubscriptionId,
    plan_id: event.planId,
    amount_minor: event.amountMinor,
    currency: 'USD',
    credits: event.credits,
    subscription_status: event.subscriptionStatus,
    current_period_end: null,
  });
}

// The app is created once, because the webhook route needs the raw body.
let agent: ReturnType<typeof import('supertest').agent>;
function getAgent() { return agent; }

beforeAll(async () => {
  const request = (await import('supertest')).default;
  const { createApp } = await import('../src/app.js');
  agent = request.agent(createApp());
  await billingService.seedPlans([PLAN]);
});

describe('plan catalog', () => {
  it('publishes the plans on offer', async () => {
    const res = await getAgent().get('/api/v1/billing/plans').expect(200);
    expect(res.body.plans.map((p: Plan) => p.id)).toContain('test-plan');
    expect(res.body.plans[0].priceMinor).toBeGreaterThan(0);
    expect(res.body.plans[0].currency).toBe('USD');
  });

  it('does not publish an inactive plan', async () => {
    await createPlan('retired-plan', false);
    const res = await getAgent().get('/api/v1/billing/plans').expect(200);
    expect(res.body.plans.map((p: Plan) => p.id)).not.toContain('retired-plan');
  });
});

describe('checkout', () => {
  it('starts a checkout without granting anything', async () => {
    const user = await createUser('checkout');
    const before = await prisma.creditWallet.findUnique({ where: { userId: user.user.id } });

    const res = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    expect(res.body.checkout.amountMinor).toBe(PLAN.priceMinor);
    expect(res.body.checkout.credits).toBe(PLAN.credits);
    expect(res.body.checkout.status).toBe('pending');
    expect(res.body.checkout.url).toContain('session=');

    // Nothing is granted until a verified payment arrives.
    const after = await prisma.creditWallet.findUnique({ where: { userId: user.user.id } });
    expect(after?.balance ?? 0).toBe(before?.balance ?? 0);
    const entitlements = await prisma.entitlement.count({ where: { userId: user.user.id } });
    expect(entitlements).toBe(0);
  });

  it('refuses a plan that does not exist', async () => {
    const user = await createUser('checkout-missing');
    await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: 'no-such-plan' }).expect(404);
  });

  it('refuses a plan that is not for sale', async () => {
    await createPlan('hidden-plan', false);
    const user = await createUser('checkout-hidden');
    await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: 'hidden-plan' }).expect(400);
  });
});

describe('webhook verification', () => {
  it('refuses a webhook with an invalid signature and writes nothing', async () => {
    const user = await createUser('webhook-bad-signature');
    const res = await sendWebhook(eventBody({ id: 'evt_bad_1', type: 'payment.succeeded', customerReference: customerReference(user.user.id), providerPaymentId: 'pay_1' }), { secret: 'the-wrong-secret' });
    expect(res.status).toBe(400);
    // The event was never recorded.
    expect(await prisma.paymentEvent.count({ where: { providerEventId: 'evt_bad_1' } })).toBe(0);
  });

  it('refuses a webhook with no signature', async () => {
    const user = await createUser('webhook-no-signature');
    const res = await getAgent().post('/api/v1/billing/webhook').set('Content-Type', 'application/json').send(eventBody({ id: 'evt_no_sig', type: 'payment.succeeded', customerReference: customerReference(user.user.id) }));
    expect(res.status).toBe(400);
  });

  it('refuses a webhook whose signature has expired', async () => {
    const user = await createUser('webhook-stale');
    const old = Math.floor(Date.now() / 1000) - 7200;
    const res = await sendWebhook(eventBody({ id: 'evt_stale', type: 'payment.succeeded', customerReference: customerReference(user.user.id) }), { timestamp: old });
    expect(res.status).toBe(400);
  });
});

describe('a verified payment grants credits and entitlements', () => {
  it('credits the customer and grants the plan entitlements', async () => {
    const user = await createUser('pay-success');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    const paymentId = checkout.body.checkout.id;

    const res = await sendWebhook(eventBody({
      id: `evt_success_${paymentId}`,
      type: 'payment.succeeded',
      customerReference: customerReference(user.user.id),
      providerPaymentId: await paymentProviderId(paymentId),
      planId: PLAN.id,
      amountMinor: PLAN.priceMinor,
      credits: PLAN.credits,
    }));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processed');

    const wallet = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.user.id } });
    expect(wallet.balance).toBeGreaterThanOrEqual(PLAN.credits);

    const entitlements = await prisma.entitlement.findMany({ where: { userId: user.user.id } });
    expect(entitlements.map((e) => e.key).sort()).toEqual(['maxBooks', 'maxChaptersPerBook']);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('succeeded');
  });

  it('does not credit a customer for a completed checkout', async () => {
    const user = await createUser('pay-checkout-only');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    const paymentId = checkout.body.checkout.id;
    const before = await prisma.creditWallet.findUnique({ where: { userId: user.user.id } });

    const res = await sendWebhook(eventBody({
      id: `evt_checkout_${paymentId}`,
      type: 'checkout.completed',
      customerReference: customerReference(user.user.id),
      providerPaymentId: await paymentProviderId(paymentId),
      planId: PLAN.id,
    }));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ignored');

    const after = await prisma.creditWallet.findUnique({ where: { userId: user.user.id } });
    expect(after?.balance ?? 0).toBe(before?.balance ?? 0);
    expect(await prisma.entitlement.count({ where: { userId: user.user.id } })).toBe(0);
  });

  it('does not credit a customer for a failed payment', async () => {
    const user = await createUser('pay-failed');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    const paymentId = checkout.body.checkout.id;
    const before = await prisma.creditWallet.findUnique({ where: { userId: user.user.id } });

    const res = await sendWebhook(eventBody({
      id: `evt_failed_${paymentId}`,
      type: 'payment.failed',
      customerReference: customerReference(user.user.id),
      providerPaymentId: await paymentProviderId(paymentId),
    }));
    expect(res.status).toBe(200);
    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.user.id } });
    expect(wallet?.balance ?? 0).toBe(before?.balance ?? 0);
    expect(await prisma.entitlement.count({ where: { userId: user.user.id } })).toBe(0);
  });

  /**
   * A provider names a checkout and a payment differently, and the pending
   * record is written against the checkout. A real Stripe payment names the
   * payment intent, so the event has to carry the session as well or the
   * settled payment can never find the checkout that bought it.
   */
  it('matches a settled payment by the checkout session when the payment id differs', async () => {
    const user = await createUser('pay-by-session');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    const paymentId = checkout.body.checkout.id;

    const record = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(record.status).toBe('pending');

    // Unique per run: the payment id is unique across payments, and the
    // database persists between runs, so a fixed id would already be held by
    // an earlier run's record and would never be written.
    const providerPaymentId = `pi_by_session_${paymentId}`;
    const res = await sendWebhook(eventBody({
      id: `evt_by_session_${paymentId}`,
      type: 'payment.succeeded',
      customerReference: customerReference(user.user.id),
      // The provider knows the payment under a different identifier than the
      // checkout it settles.
      providerPaymentId,
      providerCheckoutId: record.providerCheckoutId,
      planId: PLAN.id,
      amountMinor: PLAN.priceMinor,
      credits: PLAN.credits,
    }));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processed');

    const wallet = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.user.id } });
    expect(wallet.balance).toBeGreaterThanOrEqual(PLAN.credits);
    expect(await prisma.entitlement.count({ where: { userId: user.user.id } })).toBeGreaterThan(0);

    // The payment is settled, and the payment identifier the provider used is
    // the one on the record.
    const settled = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(settled.status).toBe('succeeded');
    expect(settled.providerPaymentId).toBe(providerPaymentId);
    expect(settled.providerCheckoutId).toBe(record.providerCheckoutId);
  });

  /**
   * A processor is free to omit the metadata the product attached to the
   * checkout. A payment intent created outside the checkout session, or a
   * provider that does not copy the session's metadata onto the intent,
   * carries no customer reference at all. The pending checkout record was
   * written by us and holds the reference, so it is the only thing that can say
   * whose money settled.
   */
  it('attributes a settled payment to its checkout when the event names no customer', async () => {
    const user = await createUser('pay-no-ref');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    const paymentId = checkout.body.checkout.id;
    const record = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });

    const res = await sendWebhook(eventBody({
      id: `evt_no_customer_${paymentId}`,
      type: 'payment.succeeded',
      // The provider delivered no customer reference of its own.
      customerReference: '',
      providerPaymentId: 'pi_without_a_customer',
      providerCheckoutId: record.providerCheckoutId,
      planId: PLAN.id,
      amountMinor: PLAN.priceMinor,
      credits: PLAN.credits,
    }));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processed');

    const wallet = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.user.id } });
    expect(wallet.balance).toBeGreaterThanOrEqual(PLAN.credits);
    expect(await prisma.entitlement.count({ where: { userId: user.user.id } })).toBeGreaterThan(0);
  });

  /**
   * The fallback must not turn into a grant for an event that belongs to
   * nobody: without a customer reference and without a pending checkout to
   * match, there is no user to credit, so the event grants nothing.
   */
  it('grants nothing for an event that names no customer and matches no checkout', async () => {
    const res = await sendWebhook(eventBody({
      id: `evt_nobody_${Date.now()}`,
      type: 'payment.succeeded',
      customerReference: '',
      providerPaymentId: 'pi_belonging_to_nobody',
      providerCheckoutId: 'cs_belonging_to_nobody',
      planId: PLAN.id,
      amountMinor: PLAN.priceMinor,
      credits: PLAN.credits,
    }));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ignored');
  });

  it("does not let one author settle another author's checkout", async () => {
    const buyer = await createUser('pay-owner');
    const other = await createUser('pay-other');
    const checkout = await buyer.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    const paymentId = checkout.body.checkout.id;
    const record = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const before = await prisma.creditWallet.findUnique({ where: { userId: other.user.id } });

    const res = await sendWebhook(eventBody({
      id: `evt_cross_owner_${paymentId}`,
      type: 'payment.succeeded',
      customerReference: customerReference(other.user.id),
      providerPaymentId: 'pi_cross_owner',
      providerCheckoutId: record.providerCheckoutId,
      planId: PLAN.id,
      amountMinor: PLAN.priceMinor,
      credits: PLAN.credits,
    }));
    expect(res.status).toBe(200);

    const after = await prisma.creditWallet.findUnique({ where: { userId: other.user.id } });
    expect(after?.balance ?? 0).toBe(before?.balance ?? 0);
    expect(await prisma.entitlement.count({ where: { userId: other.user.id } })).toBe(0);
  });
});

describe('duplicate and out-of-order events', () => {
  it('credits the customer only once for a repeated event', async () => {
    const user = await createUser('pay-duplicate');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    const paymentId = checkout.body.checkout.id;
    const event = eventBody({
      id: `evt_dup_${paymentId}`,
      type: 'payment.succeeded',
      customerReference: customerReference(user.user.id),
      providerPaymentId: await paymentProviderId(paymentId),
      planId: PLAN.id,
      credits: PLAN.credits,
    });

    await sendWebhook(event).expect(200);
    const afterFirst = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.user.id } });

    const second = await sendWebhook(event).expect(200);
    expect(second.body.duplicate).toBe(true);
    const afterSecond = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.user.id } });
    expect(afterSecond.balance).toBe(afterFirst.balance);

    // The ledger holds exactly one grant for the payment.
    const grants = await prisma.creditTransaction.count({ where: { userId: user.user.id, idempotencyKey: `payment:${paymentId}` } });
    expect(grants).toBe(1);
  });

  it('does not let an older event undo a settled payment', async () => {
    const user = await createUser('pay-out-of-order');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    const paymentId = checkout.body.checkout.id;
    const now = Date.now();

    await sendWebhook(eventBody({
      id: `evt_new_${paymentId}`,
      type: 'payment.succeeded',
      customerReference: customerReference(user.user.id),
      providerPaymentId: await paymentProviderId(paymentId),
      planId: PLAN.id,
      credits: PLAN.credits,
      occurredAt: now,
    })).expect(200);

    // An older failure arrives afterwards. It must not undo the payment.
    const res = await sendWebhook(eventBody({
      id: `evt_old_${paymentId}`,
      type: 'payment.failed',
      customerReference: customerReference(user.user.id),
      providerPaymentId: await paymentProviderId(paymentId),
      occurredAt: now - 60_000,
    }));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ignored');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('succeeded');
    const wallet = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.user.id } });
    expect(wallet.balance).toBeGreaterThanOrEqual(PLAN.credits);
  });

  it('records an event for a customer it does not know, without granting anything', async () => {
    const res = await sendWebhook(eventBody({
      id: 'evt_unknown_customer',
      type: 'payment.succeeded',
      customerReference: 'cus_not_a_customer',
      providerPaymentId: 'pay_unknown',
      credits: 500,
    }));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ignored');
    // The event is still recorded, so an operator can see it.
    expect(await prisma.paymentEvent.count({ where: { providerEventId: 'evt_unknown_customer' } })).toBe(1);
  });
});

describe('refunds', () => {
  it('takes the credits back and withdraws the entitlements', async () => {
    const user = await createUser('pay-refund');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    const paymentId = checkout.body.checkout.id;
    await sendWebhook(eventBody({
      id: `evt_refund_pay_${paymentId}`,
      type: 'payment.succeeded',
      customerReference: customerReference(user.user.id),
      providerPaymentId: await paymentProviderId(paymentId),
      planId: PLAN.id,
      credits: PLAN.credits,
    })).expect(200);

    const granted = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.user.id } });
    expect(granted.balance).toBeGreaterThanOrEqual(PLAN.credits);
    expect(await prisma.entitlement.count({ where: { userId: user.user.id } })).toBeGreaterThan(0);

    const res = await sendWebhook(eventBody({
      id: `evt_refunded_${paymentId}`,
      type: 'payment.refunded',
      customerReference: customerReference(user.user.id),
      providerPaymentId: await paymentProviderId(paymentId),
    }));
    expect(res.status).toBe(200);

    const refunded = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.user.id } });
    expect(refunded.balance).toBe(granted.balance - PLAN.credits);
    // The capabilities go with the refund.
    expect(await prisma.entitlement.count({ where: { userId: user.user.id } })).toBe(0);
  });

  it('does not take a refund twice', async () => {
    const user = await createUser('pay-refund-twice');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    const paymentId = checkout.body.checkout.id;
    await sendWebhook(eventBody({
      id: `evt_refund2_pay_${paymentId}`,
      type: 'payment.succeeded',
      customerReference: customerReference(user.user.id),
      providerPaymentId: await paymentProviderId(paymentId),
      planId: PLAN.id,
      credits: PLAN.credits,
    })).expect(200);
    await sendWebhook(eventBody({
      id: `evt_refunded2_${paymentId}`,
      type: 'payment.refunded',
      customerReference: customerReference(user.user.id),
      providerPaymentId: await paymentProviderId(paymentId),
    })).expect(200);

    const afterFirst = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.user.id } });
    await sendWebhook(eventBody({
      id: `evt_refunded2_again_${paymentId}`,
      type: 'payment.refunded',
      customerReference: customerReference(user.user.id),
      providerPaymentId: await paymentProviderId(paymentId),
    })).expect(200);
    const afterSecond = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.user.id } });
    expect(afterSecond.balance).toBe(afterFirst.balance);
  });
});

describe('billing state and isolation', () => {
  it('reports the plan, the payments and the entitlements', async () => {
    const user = await createUser('billing-state');
    await billingService.seedPlans([PLAN]);
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    await sendWebhook(eventBody({
      id: `evt_state_${checkout.body.checkout.id}`,
      type: 'payment.succeeded',
      customerReference: customerReference(user.user.id),
      providerPaymentId: await paymentProviderId(checkout.body.checkout.id),
      planId: PLAN.id,
      credits: PLAN.credits,
    })).expect(200);

    const res = await user.agent.get('/api/v1/billing').set('Origin', ORIGIN).expect(200);
    expect(res.body.plans.length).toBeGreaterThan(0);
    expect(res.body.payments.length).toBeGreaterThan(0);
    expect(res.body.entitlements.maxBooks).toBe(5);
    expect(res.body.entitlements.maxChaptersPerBook).toBe(30);
  });

  it('does not show one customer the payments of another', async () => {
    const a = await createUser('billing-owner-a');
    const b = await createUser('billing-owner-b');
    const checkout = await a.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    await sendWebhook(eventBody({
      id: `evt_owner_${checkout.body.checkout.id}`,
      type: 'payment.succeeded',
      customerReference: customerReference(a.user.id),
      providerPaymentId: await paymentProviderId(checkout.body.checkout.id),
      planId: PLAN.id,
      credits: PLAN.credits,
    })).expect(200);

    const res = await b.agent.get('/api/v1/billing/payments').set('Origin', ORIGIN).expect(200);
    expect(res.body.payments).toHaveLength(0);
  });

  it('reconciles the credit balance with the ledger', async () => {
    const user = await createUser('billing-reconcile');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    await sendWebhook(eventBody({
      id: `evt_reconcile_${checkout.body.checkout.id}`,
      type: 'payment.succeeded',
      customerReference: customerReference(user.user.id),
      providerPaymentId: await paymentProviderId(checkout.body.checkout.id),
      planId: PLAN.id,
      credits: PLAN.credits,
    })).expect(200);

    const result = await billingService.reconcile(user.user.id);
    expect(result.reconciled).toBe(true);
    expect(result.walletBalance).toBe(result.ledgerBalance);
  });
});

describe('the local provider takes the money, not the browser', () => {
  it('shows the checkout the merchant created and takes the payment', async () => {
    const user = await createUser('local-provider');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    const session = new URL(checkout.body.checkout.url).searchParams.get('session');
    if (!session) throw new Error('The checkout URL carries no session');

    // The provider's page shows the merchant's own checkout, not anything the
    // customer chose.
    const page = await getAgent().get(`/api/v1/local-provider/pay/${session}`).expect(200);
    expect(page.body.amountMinor).toBe(PLAN.priceMinor);
    expect(page.body.credits).toBe(PLAN.credits);

    const before = await prisma.creditWallet.findUnique({ where: { userId: user.user.id } });
    // The customer pays. The processor then tells the merchant over a signed
    // webhook, and only then are the credits granted.
    await getAgent().post(`/api/v1/local-provider/pay/${session}`).expect(200);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.body.checkout.id } });
    expect(payment.status).toBe('succeeded');
    const after = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.user.id } });
    expect(after.balance).toBe((before?.balance ?? 0) + PLAN.credits);
  });

  it('lets a customer buy the same plan again after the first purchase settled', async () => {
    const user = await createUser('local-provider-repeat');
    const first = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    // A double click while the first checkout is pending returns the same checkout.
    const again = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    expect(again.body.checkout.id).toBe(first.body.checkout.id);

    const session = new URL(first.body.checkout.url).searchParams.get('session')!;
    await getAgent().post(`/api/v1/local-provider/pay/${session}`).expect(200);
    const afterFirst = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.user.id } });

    // Once settled, buying the plan again is a new checkout, paid and credited on its own.
    const second = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    expect(second.body.checkout.id).not.toBe(first.body.checkout.id);
    const secondSession = new URL(second.body.checkout.url).searchParams.get('session')!;
    expect(secondSession).not.toBe(session);
    await getAgent().post(`/api/v1/local-provider/pay/${secondSession}`).expect(200);
    const afterSecond = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.user.id } });
    expect(afterSecond.balance).toBe(afterFirst.balance + PLAN.credits);
  });

  it('gives different plans different checkouts', async () => {
    await createPlan('second-plan', true);
    const user = await createUser('local-provider-two-plans');
    const a = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    const b = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: 'second-plan' }).expect(201);
    expect(b.body.checkout.id).not.toBe(a.body.checkout.id);
    expect(b.body.checkout.planId).toBe('second-plan');
    // Take the plan off sale again so it never shows up for anyone else using this database.
    await prisma.plan.update({ where: { id: 'second-plan' }, data: { active: false } });
  });

  it('does not grant anything twice when the customer pays twice', async () => {
    const user = await createUser('local-provider-twice');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PLAN.id }).expect(201);
    const session = new URL(checkout.body.checkout.url).searchParams.get('session')!;

    await getAgent().post(`/api/v1/local-provider/pay/${session}`).expect(200);
    const afterFirst = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.user.id } });

    const second = await getAgent().post(`/api/v1/local-provider/pay/${session}`).expect(200);
    expect(second.body.alreadySettled).toBe(true);
    const afterSecond = await prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.user.id } });
    expect(afterSecond.balance).toBe(afterFirst.balance);
  });

  it('refuses an unknown checkout', async () => {
    await getAgent().get('/api/v1/local-provider/pay/no-such-session').expect(404);
  });
});

describe('a recurring plan starts a subscription', () => {
  const RECURRING: Plan = { ...PLAN, id: 'test-recurring-plan', name: 'Recurring plan', recurring: true };

  beforeAll(async () => {
    await billingService.seedPlans([RECURRING]);
  });

  it('opens a subscription when the payment settles', async () => {
    const user = await createUser('recurring');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: RECURRING.id }).expect(201);
    await sendWebhook(eventBody({
      id: `evt_recurring_${checkout.body.checkout.id}`,
      type: 'payment.succeeded',
      customerReference: customerReference(user.user.id),
      providerPaymentId: await paymentProviderId(checkout.body.checkout.id),
      planId: RECURRING.id,
      credits: RECURRING.credits,
    })).expect(200);

    const res = await user.agent.get('/api/v1/billing').set('Origin', ORIGIN).expect(200);
    expect(res.body.subscription).not.toBeNull();
    expect(res.body.subscription.planId).toBe(RECURRING.id);
    expect(res.body.subscription.status).toBe('active');
    // The subscription carries a period, so the author can see when it renews.
    expect(res.body.subscription.currentPeriodEnd).toBeTruthy();
    expect(res.body.entitlements.maxBooks).toBe(5);
  });

  it('keeps a cancelled subscription until its paid period ends, then withdraws it', async () => {
    const user = await createUser('recurring-cancel');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: RECURRING.id }).expect(201);
    await sendWebhook(eventBody({
      id: `evt_recurring_cancel_${checkout.body.checkout.id}`,
      type: 'payment.succeeded',
      customerReference: customerReference(user.user.id),
      providerPaymentId: await paymentProviderId(checkout.body.checkout.id),
      planId: RECURRING.id,
      credits: RECURRING.credits,
    })).expect(200);
    expect(await prisma.entitlement.count({ where: { userId: user.user.id } })).toBeGreaterThan(0);

    await user.agent.post('/api/v1/billing/cancel').set('Origin', ORIGIN).expect(200);

    // The period is paid for, so the plan keeps running: it is shown as
    // cancelled and its capabilities expire when the period ends.
    const during = await user.agent.get('/api/v1/billing').set('Origin', ORIGIN).expect(200);
    expect(during.body.subscription).not.toBeNull();
    expect(during.body.subscription.canceledAt).toBeTruthy();
    expect(during.body.entitlements.maxBooks).toBe(5);
    const subscription = await prisma.subscription.findFirstOrThrow({ where: { userId: user.user.id } });
    const rows = await prisma.entitlement.findMany({ where: { userId: user.user.id, source: 'subscription' } });
    expect(rows.every((row) => row.expiresAt?.getTime() === subscription.currentPeriodEnd?.getTime())).toBe(true);

    // Cancelling twice changes nothing.
    await user.agent.post('/api/v1/billing/cancel').set('Origin', ORIGIN).expect(200);

    // Once the period has ended, the plan and its capabilities are gone.
    const past = new Date(Date.now() - 60_000);
    await prisma.subscription.update({ where: { id: subscription.id }, data: { currentPeriodEnd: past } });
    await prisma.entitlement.updateMany({ where: { userId: user.user.id, source: 'subscription' }, data: { expiresAt: past } });
    const after = await user.agent.get('/api/v1/billing').set('Origin', ORIGIN).expect(200);
    expect(after.body.subscription).toBeNull();
    expect(after.body.entitlements.maxBooks).toBeUndefined();
  });
});

describe('the provider boundary', () => {
  it('names the provider the build talks to', () => {
    expect(getProvider().name).toBe('local');
    // The local provider cannot take money, and says so.
    expect(getProvider().live).toBe(false);
  });
});

