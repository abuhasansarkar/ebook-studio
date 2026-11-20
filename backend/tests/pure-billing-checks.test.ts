import { describe, expect, it } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import {
  CURRENCY_MINOR_UNITS,
  WEBHOOK_SIGNATURE_HEADER,
  entitlementAllows,
  eventGrantsCredits,
  hmacHex,
  sha256Hex,
  signWebhook,
  verifyWebhookSignature,
  type EntitlementKey,
} from '@ebook/shared';

/**
 * S12 pure tests.
 *
 * These run without a database. They cover the cryptographic primitives the
 * webhook verification depends on, the rule that decides which events grant
 * credits, and the entitlement rules.
 */

describe('hashing primitives', () => {
  // The shared package has no Node dependency, so its hash is implemented by
  // hand. These vectors are checked against node:crypto so a mistake in the
  // implementation cannot pass unnoticed.
  const messages = ['', 'abc', 'The quick brown fox jumps over the lazy dog', 'x'.repeat(200), 'unicode: éè 中文 🔒'];

  it('computes the same SHA-256 as node:crypto', () => {
    for (const message of messages) {
      expect(sha256Hex(message)).toBe(createHash('sha256').update(message, 'utf8').digest('hex'));
    }
  });

  it('computes the same HMAC-SHA256 as node:crypto', () => {
    for (const key of ['k', 'secret-key', 'y'.repeat(100), 'z'.repeat(64)]) {
      for (const message of messages) {
        expect(hmacHex(key, message)).toBe(createHmac('sha256', key).update(message, 'utf8').digest('hex'));
      }
    }
  });
});

describe('webhook signature', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'payment.succeeded' });
  const secret = 'a-shared-webhook-secret';
  const timestamp = 1_700_000_000;

  it('accepts a signature it produced', () => {
    const signature = signWebhook(body, secret, timestamp);
    expect(verifyWebhookSignature(body, secret, signature, timestamp, 300, timestamp * 1000)).toBe(true);
  });

  it('refuses a body that was changed after signing', () => {
    const signature = signWebhook(body, secret, timestamp);
    expect(verifyWebhookSignature(body + ' ', secret, signature, timestamp, 300, timestamp * 1000)).toBe(false);
  });

  it('refuses a signature made with a different secret', () => {
    const signature = signWebhook(body, 'another-secret', timestamp);
    expect(verifyWebhookSignature(body, secret, signature, timestamp, 300, timestamp * 1000)).toBe(false);
  });

  it('refuses a signature that is too old', () => {
    const signature = signWebhook(body, secret, timestamp);
    // An hour later, outside the five-minute tolerance.
    expect(verifyWebhookSignature(body, secret, signature, timestamp, 300, (timestamp + 3600) * 1000)).toBe(false);
  });

  it('refuses a missing signature', () => {
    expect(verifyWebhookSignature(body, secret, undefined, timestamp, 300, timestamp * 1000)).toBe(false);
  });

  it('refuses a malformed signature', () => {
    expect(verifyWebhookSignature(body, secret, 'not-a-signature', timestamp, 300, timestamp * 1000)).toBe(false);
    expect(verifyWebhookSignature(body, secret, 'v2=abcdef', timestamp, 300, timestamp * 1000)).toBe(false);
  });

  it('uses a scheme so the algorithm can change without ambiguity', () => {
    expect(signWebhook(body, secret, timestamp).startsWith('v1=')).toBe(true);
    expect(WEBHOOK_SIGNATURE_HEADER).toBe('x-ebookstudio-signature');
  });
});

describe('credit-granting events', () => {
  it('grants credits only for a settled payment', () => {
    expect(eventGrantsCredits('payment.succeeded')).toBe(true);
    expect(eventGrantsCredits('checkout.completed')).toBe(false);
    expect(eventGrantsCredits('payment.failed')).toBe(false);
    expect(eventGrantsCredits('payment.refunded')).toBe(false);
    expect(eventGrantsCredits('subscription.updated')).toBe(false);
  });

  it('grants credits for an unknown event type', () => {
    expect(eventGrantsCredits('something.else')).toBe(false);
  });
});

describe('entitlement rules', () => {
  it('denies a capability the customer does not hold', () => {
    expect(entitlementAllows({}, 'exports')).toBe(false);
    expect(entitlementAllows({}, 'maxBooks')).toBe(false);
  });

  it('allows a boolean capability that is on', () => {
    expect(entitlementAllows({ exports: true }, 'exports')).toBe(true);
    expect(entitlementAllows({ exports: false }, 'exports')).toBe(false);
  });

  it('compares a numeric capability against the required amount', () => {
    const entitlements = { maxBooks: 5 };
    expect(entitlementAllows(entitlements, 'maxBooks')).toBe(true);
    expect(entitlementAllows(entitlements, 'maxBooks', 5)).toBe(true);
    expect(entitlementAllows(entitlements, 'maxBooks', 6)).toBe(false);
  });

  it('reads a numeric capability stored as a string', () => {
    expect(entitlementAllows({ maxChaptersPerBook: '60' } as Partial<Record<EntitlementKey, string | number | boolean>>, 'maxChaptersPerBook', 30)).toBe(true);
    expect(entitlementAllows({ maxChaptersPerBook: '60' } as Partial<Record<EntitlementKey, string | number | boolean>>, 'maxChaptersPerBook', 90)).toBe(false);
  });
});

describe('currency rules', () => {
  it('knows the minor unit of every supported currency', () => {
    for (const [currency, units] of Object.entries(CURRENCY_MINOR_UNITS)) {
      expect(units).toBe(2);
      expect(currency).toMatch(/^[A-Z]{3}$/);
    }
  });
});
