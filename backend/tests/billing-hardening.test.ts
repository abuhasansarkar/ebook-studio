import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { CREDIT_COSTS, type Plan } from '@ebook/shared';
import { prisma } from '../src/database/prisma.js';
import { closeQueues } from '../src/queues/index.js';
import { billingService, ENTITLEMENT_GRACE_MS, STALE_EVENT_CLAIM_MS } from '../src/services/billing/billingService.js';
import { hasEntitlement } from '../src/services/billing/entitlements.js';
import { customerReference, LocalProvider, SIGNATURE_HEADER, type ProviderEvent } from '../src/services/billing/provider.js';
import { clawBackInTransaction, creditService, grantInTransaction, reserveInTransaction } from '../src/services/credits/creditService.js';
import { bookService } from '../src/services/books/bookService.js';
import { aiService } from '../src/services/ai/aiService.js';
import { brief, createUser, getApp, grantEntitlements, ORIGIN } from './helpers.js';
import { bookBriefSchema } from '@ebook/shared';

afterAll(async () => { await closeQueues(); await prisma.$disconnect(); });
afterEach(() => { vi.restoreAllMocks(); });

/**
 * Billing hardening: webhook retries, real subscriptions, refunds, disputes,
 * the never-negative wallet, reservation sweeping and the request races.
 */

const PACK: Plan = {
  id: 'hard-pack', name: 'Hardening pack', description: '', priceMinor: 1000, currency: 'USD',
  credits: 400, entitlements: { maxBooks: 7 }, active: true, recurring: false,
};
const SUB: Plan = {
  id: 'hard-sub', name: 'Hardening subscription', description: '', priceMinor: 2000, currency: 'USD',
  credits: 300, entitlements: { maxBooks: 9, priorityJobs: true }, active: true, recurring: true, interval: 'month',
};

beforeAll(async () => {
  await billingService.seedPlans([PACK, SUB]);
});

/** Delivers a signed event through the real webhook route. */
function deliver(event: ProviderEvent) {
  const { body, signature, timestamp } = LocalProvider.buildEvent(event);
  return request(getApp()).post('/api/v1/billing/webhook')
    .set(SIGNATURE_HEADER, signature).set('x-ebookstudio-timestamp', String(timestamp))
    .set('Content-Type', 'application/json').send(body);
}

async function balance(userId: string) {
  return (await prisma.creditWallet.findUniqueOrThrow({ where: { userId } })).balance;
}

/** Opens a checkout and pays it through the local processor. */
async function buy(planId: string, prefix: string) {
  const user = await createUser(prefix);
  const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId }).expect(201);
  const session = new URL(checkout.body.checkout.url).searchParams.get('session')!;
  const before = await balance(user.user.id).catch(() => 0);
  await request(getApp()).post(`/api/v1/local-provider/pay/${session}`).expect(200);
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.body.checkout.id } });
  return { ...user, payment, before, ref: customerReference(user.user.id) };
}

describe('a webhook that failed is retried', () => {
  it('re-applies a failed event on the next delivery, once', async () => {
    const user = await createUser('retry-failed');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PACK.id }).expect(201);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.body.checkout.id } });
    const event: ProviderEvent = {
      providerEventId: `evt_retry_${payment.id}`, type: 'payment.succeeded', occurredAt: new Date(),
      customerReference: customerReference(user.user.id), providerPaymentId: payment.providerPaymentId, planId: PACK.id,
    };
    const start = await balance(user.user.id);

    vi.spyOn(billingService, 'applyEventBody').mockRejectedValueOnce(new Error('database blip'));
    const first = await deliver(event);
    expect(first.status).toBe(500);
    expect((await prisma.paymentEvent.findUniqueOrThrow({ where: { providerEventId: event.providerEventId } })).status).toBe('failed');
    expect(await balance(user.user.id)).toBe(start);

    // The provider retries the same event: it is applied this time.
    const second = await deliver(event).expect(200);
    expect(second.body.status).toBe('processed');
    expect(second.body.duplicate).toBe(false);
    expect(await balance(user.user.id)).toBe(start + PACK.credits);
    const row = await prisma.paymentEvent.findUniqueOrThrow({ where: { providerEventId: event.providerEventId } });
    expect(row.attempts).toBe(2);

    // Once processed, a further repeat is a duplicate and grants nothing.
    const third = await deliver(event).expect(200);
    expect(third.body.duplicate).toBe(true);
    expect(await balance(user.user.id)).toBe(start + PACK.credits);
  });

  it('asks the provider to retry while another attempt is in flight, and reclaims a stale one', async () => {
    const user = await createUser('retry-stale');
    const checkout = await user.agent.post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({ planId: PACK.id }).expect(201);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.body.checkout.id } });
    const event: ProviderEvent = {
      providerEventId: `evt_stale_${payment.id}`, type: 'payment.succeeded', occurredAt: new Date(),
      customerReference: customerReference(user.user.id), providerPaymentId: payment.providerPaymentId, planId: PACK.id,
    };
    // An attempt that claimed the event and has not finished.
    await prisma.paymentEvent.create({ data: { providerEventId: event.providerEventId, type: event.type, occurredAt: event.occurredAt, payload: {}, status: 'received' } });
    const inFlight = await deliver(event);
    expect(inFlight.status).toBe(409);

    // The attempt crashed: its claim goes stale and the next delivery takes over.
    await prisma.paymentEvent.update({ where: { providerEventId: event.providerEventId }, data: { claimedAt: new Date(Date.now() - STALE_EVENT_CLAIM_MS - 1000) } });
    const start = await balance(user.user.id);
    const res = await deliver(event).expect(200);
    expect(res.body.status).toBe('processed');
    expect(await balance(user.user.id)).toBe(start + PACK.credits);
  });

  it('lets only one of two concurrent deliveries reclaim a failed event', async () => {
    const row = await prisma.paymentEvent.create({ data: { providerEventId: `evt_race_${Date.now()}_${Math.random()}`, type: 'x', occurredAt: new Date(), payload: {}, status: 'failed' } });
    const results = await Promise.all([billingService.reclaimEvent(row), billingService.reclaimEvent(row), billingService.reclaimEvent(row)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('a recurring plan is a real subscription', () => {
  it('opens the subscription from its first invoice, with capabilities that expire with the period', async () => {
    const a = await buy(SUB.id, 'sub-open');
    expect(a.payment.status).toBe('succeeded');
    expect(a.payment.providerSubscriptionId).toBeTruthy();
    expect(a.payment.providerInvoiceId).toBeTruthy();
    expect(await balance(a.user.id)).toBe(a.before + SUB.credits);

    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { providerSubscriptionId: a.payment.providerSubscriptionId! } });
    expect(subscription.status).toBe('active');
    const rows = await prisma.entitlement.findMany({ where: { userId: a.user.id } });
    expect(rows.map((r) => r.key).sort()).toEqual(['maxBooks', 'priorityJobs']);
    for (const row of rows) {
      expect(row.source).toBe('subscription');
      expect(row.expiresAt?.getTime()).toBe(subscription.currentPeriodEnd!.getTime() + ENTITLEMENT_GRACE_MS);
    }
    expect(await hasEntitlement(a.user.id, 'priorityJobs')).toBe(true);
  });

  it('grants the renewal credits and extends the period on every paid renewal, once per invoice', async () => {
    const a = await buy(SUB.id, 'sub-renew');
    const subId = a.payment.providerSubscriptionId!;
    const before = await prisma.subscription.findUniqueOrThrow({ where: { providerSubscriptionId: subId } });
    const afterFirst = await balance(a.user.id);

    const renew = await request(getApp()).post(`/api/v1/local-provider/subscriptions/${subId}/renew`).expect(200);
    expect(renew.body.status).toBe('processed');
    expect(await balance(a.user.id)).toBe(afterFirst + SUB.credits);
    const after = await prisma.subscription.findUniqueOrThrow({ where: { providerSubscriptionId: subId } });
    expect(after.currentPeriodEnd!.getTime()).toBeGreaterThan(before.currentPeriodEnd!.getTime());
    const row = await prisma.entitlement.findFirstOrThrow({ where: { userId: a.user.id, key: 'maxBooks' } });
    expect(row.expiresAt!.getTime()).toBe(after.currentPeriodEnd!.getTime() + ENTITLEMENT_GRACE_MS);

    // The same invoice delivered again under another event id grants nothing.
    const payment = await prisma.payment.findUniqueOrThrow({ where: { providerInvoiceId: renew.body.invoiceId } });
    await deliver({
      providerEventId: `evt_dup_invoice_${payment.id}`, type: 'invoice.paid', occurredAt: new Date(), customerReference: a.ref,
      providerSubscriptionId: subId, providerInvoiceId: renew.body.invoiceId, billingReason: 'subscription_cycle', planId: SUB.id,
    }).expect(200);
    expect(await balance(a.user.id)).toBe(afterFirst + SUB.credits);
    expect(await prisma.creditTransaction.count({ where: { idempotencyKey: `payment:${payment.id}` } })).toBe(1);
  });

  it('stops unlocking anything once the paid period is over', async () => {
    const a = await buy(SUB.id, 'sub-lapse');
    expect(await hasEntitlement(a.user.id, 'priorityJobs')).toBe(true);
    // No renewal was paid: the period (and its grace) runs out.
    await prisma.entitlement.updateMany({ where: { userId: a.user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await hasEntitlement(a.user.id, 'priorityJobs')).toBe(false);
  });

  it('marks a subscription past due when its invoice fails and ends it when the provider deletes it', async () => {
    const a = await buy(SUB.id, 'sub-fail');
    const subId = a.payment.providerSubscriptionId!;
    await deliver({ providerEventId: `evt_inv_fail_${subId}`, type: 'invoice.payment_failed', occurredAt: new Date(), customerReference: a.ref, providerSubscriptionId: subId, providerInvoiceId: `in_fail_${subId}` }).expect(200);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { providerSubscriptionId: subId } })).status).toBe('past_due');
    // A failed invoice grants nothing.
    expect(await balance(a.user.id)).toBe(a.before + SUB.credits);

    await deliver({ providerEventId: `evt_sub_del_${subId}`, type: 'subscription.canceled', occurredAt: new Date(Date.now() + 1000), customerReference: a.ref, providerSubscriptionId: subId, subscriptionStatus: 'canceled' }).expect(200);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { providerSubscriptionId: subId } })).status).toBe('canceled');
    expect(await prisma.entitlement.count({ where: { userId: a.user.id } })).toBe(0);
  });

  it('shortens the capabilities to the period end when the subscription is set to cancel', async () => {
    const a = await buy(SUB.id, 'sub-cancel-at-end');
    const subId = a.payment.providerSubscriptionId!;
    await deliver({ providerEventId: `evt_sub_upd_${subId}`, type: 'subscription.updated', occurredAt: new Date(Date.now() + 1000), customerReference: a.ref, providerSubscriptionId: subId, subscriptionStatus: 'active', cancelAtPeriodEnd: true }).expect(200);
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { providerSubscriptionId: subId } });
    expect(subscription.canceledAt).toBeTruthy();
    const rows = await prisma.entitlement.findMany({ where: { userId: a.user.id } });
    expect(rows.every((r) => r.expiresAt?.getTime() === subscription.currentPeriodEnd!.getTime())).toBe(true);
  });

  it('tells the provider to stop billing when the author cancels', async () => {
    const spy = vi.spyOn(LocalProvider.prototype, 'cancelSubscription');
    const a = await buy(SUB.id, 'sub-author-cancel');
    await a.agent.post('/api/v1/billing/cancel').set('Origin', ORIGIN).expect(200);
    expect(spy).toHaveBeenCalledWith(a.payment.providerSubscriptionId, { atPeriodEnd: true });
  });
});

describe('refunds', () => {
  it('withdraws a refunded subscription and cancels it at the provider', async () => {
    const spy = vi.spyOn(LocalProvider.prototype, 'cancelSubscription');
    const a = await buy(SUB.id, 'refund-sub');
    expect(await prisma.entitlement.count({ where: { userId: a.user.id } })).toBe(2);

    // The refund names only the payment (Stripe puts no metadata on a charge).
    const res = await deliver({ providerEventId: `evt_refund_sub_${a.payment.id}`, type: 'payment.refunded', occurredAt: new Date(), customerReference: '', providerPaymentId: a.payment.providerPaymentId, amountMinor: SUB.priceMinor, totalAmountMinor: SUB.priceMinor }).expect(200);
    expect(res.body.status).toBe('processed');
    expect(await prisma.entitlement.count({ where: { userId: a.user.id } })).toBe(0);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { providerSubscriptionId: a.payment.providerSubscriptionId! } })).status).toBe('canceled');
    expect(spy).toHaveBeenCalledWith(a.payment.providerSubscriptionId, { atPeriodEnd: false });
    expect(await balance(a.user.id)).toBe(a.before);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: a.payment.id } })).status).toBe('refunded');
  });

  it('claws back a partial refund proportionally and keeps the plan until the refund is full', async () => {
    const a = await buy(PACK.id, 'refund-partial');
    const base = { type: 'payment.refunded', customerReference: '', providerPaymentId: a.payment.providerPaymentId, totalAmountMinor: PACK.priceMinor };

    // 25% refunded: a quarter of the 400 credits.
    await deliver({ ...base, providerEventId: `evt_partial1_${a.payment.id}`, occurredAt: new Date(), amountMinor: 250 }).expect(200);
    expect(await balance(a.user.id)).toBe(a.before + 300);
    let payment = await prisma.payment.findUniqueOrThrow({ where: { id: a.payment.id } });
    expect(payment.status).toBe('partially_refunded');
    expect(payment.refundedCredits).toBe(100);
    expect(await prisma.entitlement.count({ where: { userId: a.user.id } })).toBe(1);

    // The provider reports the cumulative amount: 333 of 1000 refunded now.
    await deliver({ ...base, providerEventId: `evt_partial2_${a.payment.id}`, occurredAt: new Date(), amountMinor: 333 }).expect(200);
    // floor(400 * 333 / 1000) = 133, of which 100 were already taken.
    expect(await balance(a.user.id)).toBe(a.before + 400 - 133);

    // An older, smaller refund report arriving late takes nothing.
    await deliver({ ...base, providerEventId: `evt_partial_old_${a.payment.id}`, occurredAt: new Date(), amountMinor: 250 }).expect(200);
    expect(await balance(a.user.id)).toBe(a.before + 400 - 133);

    // The rest is refunded: everything goes, with the capabilities.
    await deliver({ ...base, providerEventId: `evt_partial3_${a.payment.id}`, occurredAt: new Date(), amountMinor: 1000 }).expect(200);
    expect(await balance(a.user.id)).toBe(a.before);
    payment = await prisma.payment.findUniqueOrThrow({ where: { id: a.payment.id } });
    expect(payment.status).toBe('refunded');
    expect(payment.refundedCredits).toBe(400);
    expect(await prisma.entitlement.count({ where: { userId: a.user.id } })).toBe(0);

    const reconcile = await billingService.reconcile(a.user.id);
    expect(reconcile.reconciled).toBe(true);
  });

  it('never takes the wallet below zero and records what it could not take back', async () => {
    const a = await buy(PACK.id, 'refund-spent');
    // The author spends most of the credits.
    const spend = (await balance(a.user.id)) - 50;
    await creditService.spend(a.user.id, spend, `test-spend:${a.payment.id}`, 'Spent');
    expect(await balance(a.user.id)).toBe(50);

    await deliver({ providerEventId: `evt_refund_spent_${a.payment.id}`, type: 'payment.refunded', occurredAt: new Date(), customerReference: a.ref, providerPaymentId: a.payment.providerPaymentId }).expect(200);
    expect(await balance(a.user.id)).toBe(0);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: a.payment.id } });
    expect(payment.refundedCredits).toBe(50);
    expect(payment.refundShortfallCredits).toBe(PACK.credits - 50);
    const ledger = await prisma.creditTransaction.findFirstOrThrow({ where: { userId: a.user.id, type: 'refund', reference: `payment:${a.payment.id}` } });
    expect(ledger.amount).toBe(-50);
    expect(ledger.balanceAfter).toBe(0);
    expect((await billingService.reconcile(a.user.id)).reconciled).toBe(true);
  });

  it('refuses a negative balance at the database', async () => {
    const user = await createUser('wallet-check');
    await creditService.getWallet(user.user.id);
    await expect(prisma.creditWallet.update({ where: { userId: user.user.id }, data: { balance: -1 } })).rejects.toThrow();
    await expect(prisma.creditWallet.update({ where: { userId: user.user.id }, data: { reserved: -1 } })).rejects.toThrow();
  });
});

describe('disputes', () => {
  it('takes the disputed credits and capabilities while open and restores them when won', async () => {
    const a = await buy(PACK.id, 'dispute-won');
    const paid = await balance(a.user.id);
    const base = { customerReference: '', providerPaymentId: a.payment.providerPaymentId, providerDisputeId: `dp_${a.payment.id}`, amountMinor: PACK.priceMinor, totalAmountMinor: PACK.priceMinor };

    await deliver({ ...base, providerEventId: `evt_dispute_${a.payment.id}`, type: 'payment.disputed', occurredAt: new Date(), disputeStatus: 'needs_response' }).expect(200);
    expect(await balance(a.user.id)).toBe(paid - PACK.credits);
    expect(await prisma.entitlement.count({ where: { userId: a.user.id } })).toBe(0);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: a.payment.id } })).disputeStatus).toBe('open');

    await deliver({ ...base, providerEventId: `evt_dispute_won_${a.payment.id}`, type: 'payment.dispute_closed', occurredAt: new Date(), disputeStatus: 'won' }).expect(200);
    expect(await balance(a.user.id)).toBe(paid);
    expect(await prisma.entitlement.count({ where: { userId: a.user.id } })).toBe(1);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: a.payment.id } })).disputeStatus).toBe('won');
  });

  it('keeps the credits taken when the dispute is lost', async () => {
    const a = await buy(PACK.id, 'dispute-lost');
    const paid = await balance(a.user.id);
    const base = { customerReference: '', providerPaymentId: a.payment.providerPaymentId, providerDisputeId: `dp_${a.payment.id}`, amountMinor: PACK.priceMinor, totalAmountMinor: PACK.priceMinor };
    await deliver({ ...base, providerEventId: `evt_dispute2_${a.payment.id}`, type: 'payment.disputed', occurredAt: new Date() }).expect(200);
    await deliver({ ...base, providerEventId: `evt_dispute2_lost_${a.payment.id}`, type: 'payment.dispute_closed', occurredAt: new Date(), disputeStatus: 'lost' }).expect(200);
    expect(await balance(a.user.id)).toBe(paid - PACK.credits);
    expect(await prisma.entitlement.count({ where: { userId: a.user.id } })).toBe(0);
  });
});

describe('the credit ledger inside a transaction', () => {
  it('rolls a grant back with the transaction it belongs to', async () => {
    const user = await createUser('grant-tx');
    const start = (await creditService.getWallet(user.user.id)).balance;
    await expect(prisma.$transaction(async (tx) => {
      await grantInTransaction(tx, user.user.id, 100, `grant-tx:${user.user.id}`, 'Test');
      throw new Error('the payment update failed');
    })).rejects.toThrow('the payment update failed');
    expect(await balance(user.user.id)).toBe(start);
    expect(await prisma.creditTransaction.count({ where: { idempotencyKey: `grant-tx:${user.user.id}` } })).toBe(0);
  });

  it('claws back from the balance as it is inside the transaction', async () => {
    const user = await createUser('clawback-tx');
    const start = (await creditService.getWallet(user.user.id)).balance;
    const result = await prisma.$transaction((tx) => clawBackInTransaction(tx, user.user.id, start + 10, `claw:${user.user.id}`, 'Test'));
    expect(result).toMatchObject({ taken: start, shortfall: 10, balance: 0 });
    expect(await balance(user.user.id)).toBe(0);
  });
});

describe('stale reservations are swept', () => {
  it('releases a synchronous reservation a crash left open, and never a job reservation', async () => {
    const user = await createUser('sweep');
    const start = (await creditService.getWallet(user.user.id)).balance;
    const syncRef = `listing:${user.user.id}:crashed`;
    const jobRef = `job:sweep-${user.user.id}`;
    await prisma.$transaction(async (tx) => {
      await reserveInTransaction(tx, user.user.id, 5, syncRef);
      await reserveInTransaction(tx, user.user.id, 7, jobRef);
    });
    expect(await prisma.creditReservation.count({ where: { userId: user.user.id, settledAt: null } })).toBe(2);
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await prisma.creditReservation.updateMany({ where: { userId: user.user.id }, data: { createdAt: old } });

    const swept = await creditService.sweepStaleReservations(60 * 60 * 1000);
    expect(swept.released).toBeGreaterThanOrEqual(1);
    const wallet = await creditService.getWallet(user.user.id);
    expect(wallet.balance).toBe(start - 7);
    expect(wallet.reserved).toBe(7);
    expect((await prisma.creditReservation.findUniqueOrThrow({ where: { reference: syncRef } })).settledAt).toBeTruthy();
    expect((await prisma.creditReservation.findUniqueOrThrow({ where: { reference: jobRef } })).settledAt).toBeNull();

    // A late settle for the swept reference changes nothing, and a second sweep finds nothing.
    await creditService.settle(user.user.id, 5, 5, syncRef);
    expect((await creditService.getWallet(user.user.id)).balance).toBe(start - 7);
    await creditService.sweepStaleReservations(60 * 60 * 1000);
    expect((await creditService.getWallet(user.user.id)).balance).toBe(start - 7);

    // Settling the job marks its reservation settled too.
    await creditService.settle(user.user.id, 7, 7, jobRef);
    expect((await prisma.creditReservation.findUniqueOrThrow({ where: { reference: jobRef } })).settledAt).toBeTruthy();
    expect((await billingService.reconcile(user.user.id)).reconciled).toBe(true);
  });

  it('leaves a recent reservation alone', async () => {
    const user = await createUser('sweep-recent');
    const ref = `marketing:${user.user.id}:inflight`;
    await creditService.reserve(user.user.id, 3, ref);
    await creditService.sweepStaleReservations(60 * 60 * 1000);
    expect((await prisma.creditReservation.findUniqueOrThrow({ where: { reference: ref } })).settledAt).toBeNull();
    await creditService.settle(user.user.id, 3, 0, ref);
  });
});

describe('request races', () => {
  it('returns the same pending checkout to concurrent clicks', async () => {
    const user = await createUser('checkout-race');
    const results = await Promise.all([
      billingService.startCheckout(user.user.id, PACK.id),
      billingService.startCheckout(user.user.id, PACK.id),
      billingService.startCheckout(user.user.id, PACK.id),
    ]);
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await prisma.payment.count({ where: { userId: user.user.id } })).toBe(1);
  });

  it('does not let concurrent creates exceed the book quota', async () => {
    const user = await createUser('quota-race');
    await grantEntitlements(user.user.id, { maxBooks: 1 });
    const input = bookBriefSchema.parse(brief({ title: 'Race' }).brief);
    const results = await Promise.allSettled([1, 2, 3].map(() => bookService.create(user.user.id, input)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.book.count({ where: { userId: user.user.id, deletedAt: null } })).toBe(1);
  });

  it('replays an AI assist for a repeated request key without calling the AI or charging again', async () => {
    const user = await createUser('assist-replay');
    const book = await bookService.create(user.user.id, bookBriefSchema.parse(brief({ title: 'Assist' }).brief));
    const spy = vi.spyOn(aiService, 'assist');
    const start = (await creditService.getWallet(user.user.id)).balance;
    const send = (key: string) => user.agent.post('/api/v1/ai/assist').set('Origin', ORIGIN).set('Idempotency-Key', key)
      .send({ bookId: book.id, action: 'to_bullets', text: 'One. Two.' });

    const first = await send(`assist-${user.user.id.slice(-8)}`).expect(200);
    const replay = await send(`assist-${user.user.id.slice(-8)}`).expect(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.text).toBe(first.body.text);
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await creditService.getWallet(user.user.id)).balance).toBe(start - CREDIT_COSTS.assist);

    // A new request is a new, charged call.
    await send(`assist2-${user.user.id.slice(-8)}`).expect(200);
    expect(spy).toHaveBeenCalledTimes(2);
    expect((await creditService.getWallet(user.user.id)).balance).toBe(start - 2 * CREDIT_COSTS.assist);
  });
});
