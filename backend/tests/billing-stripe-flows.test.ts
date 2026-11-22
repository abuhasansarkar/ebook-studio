import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plan } from '@ebook/shared';
import type { CheckoutRequest, PaymentProvider, ProviderEvent } from '../src/services/billing/provider.js';

/**
 * Billing flows as they run against a processor that bills subscriptions
 * itself (Stripe). The processor is a stub: nothing here reaches Stripe.
 */

const fake = {
  name: 'stripe',
  live: false,
  signatureHeader: 'stripe-signature',
  createCheckout: vi.fn(async (request: CheckoutRequest) => ({
    providerCheckoutId: `cs_${request.idempotencyKey.replace(/[^a-z0-9]/gi, '')}`,
    providerPaymentId: `pending_cs_${request.idempotencyKey.replace(/[^a-z0-9]/gi, '')}`,
    customerReference: request.customerReference,
    url: 'https://checkout.example/session',
  })),
  verifyWebhook: vi.fn(() => null),
  fetchSubscription: vi.fn(async () => ({ status: 'active', currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) })),
  fetchCheckoutSession: vi.fn(),
  cancelSubscription: vi.fn(async () => undefined),
  paymentIntentForInvoice: vi.fn(async () => undefined),
  resolveCheckoutSession: vi.fn(async () => undefined),
} satisfies PaymentProvider & Record<string, unknown>;

vi.mock('../src/services/billing/provider.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/services/billing/provider.js')>();
  return { ...original, getProvider: () => fake };
});

const { prisma } = await import('../src/database/prisma.js');
const { closeQueues } = await import('../src/queues/index.js');
const { billingService } = await import('../src/services/billing/billingService.js');
const { customerReference } = await import('../src/services/billing/provider.js');
const { createUser } = await import('./helpers.js');

afterAll(async () => { await closeQueues(); await prisma.$disconnect(); });

const SUB: Plan = {
  id: 'stripe-flow-sub', name: 'Stripe flow subscription', description: '', priceMinor: 2000, currency: 'USD',
  credits: 300, entitlements: { maxBooks: 11 }, active: true, recurring: true, interval: 'month',
};
const UNPRICED: Plan = { ...SUB, id: 'stripe-flow-unpriced', name: 'Unpriced subscription' };
const PACK: Plan = {
  id: 'stripe-flow-pack', name: 'Stripe flow pack', description: '', priceMinor: 900, currency: 'USD',
  credits: 150, entitlements: {}, active: true, recurring: false,
};

beforeAll(async () => {
  await billingService.seedPlans([SUB, UNPRICED, PACK]);
  await prisma.plan.update({ where: { id: SUB.id }, data: { providerPriceId: 'price_test_sub' } });
  await prisma.plan.update({ where: { id: UNPRICED.id }, data: { providerPriceId: null } });
});
beforeEach(() => { vi.clearAllMocks(); });

async function balance(userId: string) {
  return (await prisma.creditWallet.findUnique({ where: { userId } }))?.balance ?? 0;
}

describe('a recurring plan under a subscription-billing processor', () => {
  it('refuses to check out a recurring plan with no processor price, instead of charging once', async () => {
    const user = await createUser('stripe-unpriced');
    await expect(billingService.startCheckout(user.user.id, UNPRICED.id)).rejects.toMatchObject({ status: 409 });
    expect(fake.createCheckout).not.toHaveBeenCalled();
    expect(await prisma.payment.count({ where: { userId: user.user.id } })).toBe(0);
  });

  it('opens a subscription checkout against the plan price', async () => {
    const user = await createUser('stripe-priced');
    await billingService.startCheckout(user.user.id, SUB.id);
    expect(fake.createCheckout).toHaveBeenCalledWith(expect.objectContaining({ recurring: true, providerPriceId: 'price_test_sub', interval: 'month' }));
  });

  it('opens a one-time checkout for a credit pack', async () => {
    const user = await createUser('stripe-pack');
    await billingService.startCheckout(user.user.id, PACK.id);
    expect(fake.createCheckout).toHaveBeenCalledWith(expect.objectContaining({ recurring: false }));
  });

  it('grants nothing for a bare payment on a subscription; the invoice settles it', async () => {
    const user = await createUser('stripe-bare-payment');
    const checkout = await billingService.startCheckout(user.user.id, SUB.id);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.id } });
    const start = await balance(user.user.id);
    const ref = customerReference(user.user.id);

    const bare: ProviderEvent = { providerEventId: `evt_bare_${payment.id}`, type: 'payment.succeeded', occurredAt: new Date(), customerReference: ref, providerPaymentId: `pi_bare_${payment.id}`, providerCheckoutId: payment.providerCheckoutId };
    const outcome = await billingService.applyEvent(bare, JSON.stringify({}), '');
    expect(outcome.status).toBe('ignored');
    expect(await balance(user.user.id)).toBe(start);

    const invoice: ProviderEvent = {
      providerEventId: `evt_inv_${payment.id}`, type: 'invoice.paid', occurredAt: new Date(), customerReference: ref,
      providerSubscriptionId: `sub_${payment.id}`, providerInvoiceId: `in_${payment.id}`, providerPaymentId: `pi_inv_${payment.id}`,
      billingReason: 'subscription_create', planId: SUB.id, currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    };
    expect((await billingService.applyEvent(invoice, JSON.stringify({}), '')).status).toBe('processed');
    expect(await balance(user.user.id)).toBe(start + SUB.credits);
    const settled = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(settled).toMatchObject({ status: 'succeeded', providerInvoiceId: `in_${payment.id}`, providerPaymentId: `pi_inv_${payment.id}` });

    // The refund of that invoice's charge finds the payment by its intent.
    const refund: ProviderEvent = { providerEventId: `evt_ref_${payment.id}`, type: 'payment.refunded', occurredAt: new Date(), customerReference: '', providerPaymentId: `pi_inv_${payment.id}`, amountMinor: 2000, totalAmountMinor: 2000 };
    expect((await billingService.applyEvent(refund, JSON.stringify({}), '')).status).toBe('processed');
    expect(fake.cancelSubscription).toHaveBeenCalledWith(`sub_${payment.id}`, { atPeriodEnd: false });
    expect(await balance(user.user.id)).toBe(start);
    expect(await prisma.entitlement.count({ where: { userId: user.user.id } })).toBe(0);
  });
});

describe('syncing a pending checkout with the processor', () => {
  it('grants nothing for a checkout that is complete but not paid', async () => {
    const user = await createUser('stripe-sync-unpaid');
    const checkout = await billingService.startCheckout(user.user.id, PACK.id);
    const start = await balance(user.user.id);
    fake.fetchCheckoutSession.mockResolvedValue({ status: 'complete', paymentStatus: 'unpaid', mode: 'payment', paymentIntentId: `pi_async_${checkout.id}` });
    await billingService.syncPendingPayments(user.user.id);
    expect(await balance(user.user.id)).toBe(start);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: checkout.id } })).status).toBe('pending');
  });

  it('settles a paid one-time checkout', async () => {
    const user = await createUser('stripe-sync-paid');
    const checkout = await billingService.startCheckout(user.user.id, PACK.id);
    const start = await balance(user.user.id);
    fake.fetchCheckoutSession.mockResolvedValue({ status: 'complete', paymentStatus: 'paid', mode: 'payment', paymentIntentId: `pi_sync_${checkout.id}` });
    await billingService.syncPendingPayments(user.user.id);
    expect(await balance(user.user.id)).toBe(start + PACK.credits);
  });

  it('settles a paid subscription checkout once, even when its invoice webhook follows', async () => {
    const user = await createUser('stripe-sync-sub');
    const checkout = await billingService.startCheckout(user.user.id, SUB.id);
    const start = await balance(user.user.id);
    fake.fetchCheckoutSession.mockResolvedValue({ status: 'complete', paymentStatus: 'paid', mode: 'subscription', subscriptionId: `sub_sync_${checkout.id}`, invoiceId: `in_sync_${checkout.id}` });
    await billingService.syncPendingPayments(user.user.id);
    expect(await balance(user.user.id)).toBe(start + SUB.credits);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { providerSubscriptionId: `sub_sync_${checkout.id}` } })).status).toBe('active');

    await billingService.applyEvent({
      providerEventId: `evt_sync_inv_${checkout.id}`, type: 'invoice.paid', occurredAt: new Date(), customerReference: customerReference(user.user.id),
      providerSubscriptionId: `sub_sync_${checkout.id}`, providerInvoiceId: `in_sync_${checkout.id}`, billingReason: 'subscription_create', planId: SUB.id,
    }, JSON.stringify({}), '');
    expect(await balance(user.user.id)).toBe(start + SUB.credits);
  });
});

describe('cancelling', () => {
  it('stops the renewal at the processor before the local record changes', async () => {
    const user = await createUser('stripe-cancel');
    const checkout = await billingService.startCheckout(user.user.id, SUB.id);
    await billingService.applyEvent({
      providerEventId: `evt_cancel_inv_${checkout.id}`, type: 'invoice.paid', occurredAt: new Date(), customerReference: customerReference(user.user.id),
      providerSubscriptionId: `sub_cancel_${checkout.id}`, providerInvoiceId: `in_cancel_${checkout.id}`, billingReason: 'subscription_create', planId: SUB.id,
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    }, JSON.stringify({}), '');

    fake.cancelSubscription.mockRejectedValueOnce(new Error('Stripe is unreachable'));
    await expect(billingService.cancelSubscription(user.user.id)).rejects.toThrow('Stripe is unreachable');
    expect((await prisma.subscription.findUniqueOrThrow({ where: { providerSubscriptionId: `sub_cancel_${checkout.id}` } })).canceledAt).toBeNull();

    await billingService.cancelSubscription(user.user.id);
    expect(fake.cancelSubscription).toHaveBeenLastCalledWith(`sub_cancel_${checkout.id}`, { atPeriodEnd: true });
    expect((await prisma.subscription.findUniqueOrThrow({ where: { providerSubscriptionId: `sub_cancel_${checkout.id}` } })).canceledAt).toBeTruthy();
  });
});

describe('the local processor', () => {
  it('refuses to answer when the build talks to a real processor', async () => {
    const { localProviderAllowed } = await import('../src/routes/local-provider.js');
    expect(localProviderAllowed()).toBe(false);
    const user = await createUser('stripe-local-refused');
    const checkout = await billingService.startCheckout(user.user.id, PACK.id);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.id } });
    const request = (await import('supertest')).default;
    const { getApp } = await import('./helpers.js');
    await request(getApp()).post(`/api/v1/local-provider/pay/${payment.providerCheckoutId}`).expect(404);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: checkout.id } })).status).toBe('pending');
  });
});
