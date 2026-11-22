import { z } from 'zod';

/**
 * S12 paid plans contract.
 *
 * A plan is what the customer buys: a price in a currency, a number of credits
 * it grants, and a set of entitlements it carries. Entitlements are the only
 * thing that grants access to a paid capability, and they are granted by
 * *verified* payment state — never by a browser callback.
 */

/**
 * The currencies this product can be sold in.
 *
 * The currency is fixed per plan and stored on the payment, so a price can
 * never be reinterpreted after the fact.
 */
export const PAYMENT_CURRENCIES = ['USD', 'EUR', 'GBP'] as const;
export type PaymentCurrency = typeof PAYMENT_CURRENCIES[number];

/** The currencies' minor units, so an amount is never a floating-point value. */
export const CURRENCY_MINOR_UNITS: Record<PaymentCurrency, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
};

/**
 * The entitlement keys the product checks.
 *
 * An entitlement is a named capability with a value, for example
 * `maxBooks: 50` or `exports: true`.
 */
export const ENTITLEMENT_KEYS = ['maxBooks', 'maxChaptersPerBook', 'priorityJobs', 'exports', 'sourceImports'] as const;
export type EntitlementKey = typeof ENTITLEMENT_KEYS[number];

/** The subscription states a provider can report. */
export const SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired'] as const;
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number];

/** The payment states a provider can report. */
export const PAYMENT_STATUSES = ['pending', 'succeeded', 'failed', 'refunded', 'partially_refunded'] as const;
export type PaymentStatus = typeof PAYMENT_STATUSES[number];

/**
 * A plan in the catalog.
 *
 * The price is in the currency's minor unit: 1200 is USD 12.00.
 */
export interface Plan {
  id: string;
  name: string;
  description: string;
  /** Price in the currency's minor unit. */
  priceMinor: number;
  currency: PaymentCurrency;
  /** Credits granted when the plan is bought. */
  credits: number;
  /** The capabilities this plan carries. */
  entitlements: Partial<Record<EntitlementKey, string | number | boolean>>;
  /** Only an active plan can be bought. */
  active: boolean;
  /** Whether the plan renews at the end of its period. */
  recurring: boolean;
  /** Billing interval: 'month' (default) or 'year'. */
  interval?: 'month' | 'year';
}

/** A subscription to a plan. */
export interface Subscription {
  id: string;
  planId: string;
  planName: string;
  status: SubscriptionStatus;
  /** When the current period ends. */
  currentPeriodEnd: string | null;
  /** When the author cancelled. A cancelled subscription runs to the end of its period. */
  canceledAt: string | null;
  createdAt: string;
}

/** A payment, as recorded locally. */
export interface Payment {
  id: string;
  planId: string | null;
  planName: string | null;
  /** Amount in the currency's minor unit. */
  amountMinor: number;
  currency: PaymentCurrency;
  status: PaymentStatus;
  /** The credits this payment granted. */
  credits: number;
  description: string;
  createdAt: string;
}

export interface CurrentPlanInfo {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: PaymentCurrency;
  status: SubscriptionStatus;
  recurring: boolean;
  credits: number;
  interval?: "month" | "year";
  currentPeriodEnd: string | null;
  canceledAt: string | null;
}

/** The billing state of the signed-in author. */
export interface BillingState {
  /** The author's current active plan information. */
  currentPlan?: CurrentPlanInfo;
  /** The author's current subscription, when there is one. */
  subscription: Subscription | null;
  /** Full subscription history. */
  subscriptions?: Subscription[];
  /** The entitlements the author currently holds. */
  entitlements: Partial<Record<EntitlementKey, string | number | boolean>>;
  /** The plans on offer. */
  plans: Plan[];
  /** The author's payments, newest first. */
  payments: Payment[];
  /** The provider name (e.g. stripe or local). */
  provider: string;
  /** True when provider is running in live production mode. */
  providerLive?: boolean;
}

/** A checkout session the author was sent to. */
export interface CheckoutSession {
  id: string;
  planId: string;
  planName: string;
  amountMinor: number;
  currency: PaymentCurrency;
  credits: number;
  /** Where the author completes the payment. */
  url: string;
  /** The state of the payment so far. */
  status: PaymentStatus;
  createdAt: string;
}

/** The request body for starting a checkout. */
export const checkoutSchema = z.object({
  planId: z.string().trim().min(1).max(64),
}).strict();
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/**
 * The entitlement a plan grants.
 *
 * A plan without entitlements grants none; the free tier is the absence of a
 * subscription rather than a plan with empty entitlements.
 */
export function planEntitlements(plan: Plan): Partial<Record<EntitlementKey, string | number | boolean>> {
  return { ...plan.entitlements };
}

/**
 * The capabilities every author holds, whether or not they have paid.
 *
 * Private source import is part of the research workspace, which every author
 * can reach, and the free tier carries one book of up to ten chapters. These
 * are **not** paid entitlements: a plan cannot withdraw them, and a refund
 * does not take them away, because they were never bought.
 *
 * File export (PDF, EPUB, DOCX) is **not** free: it is the `exports` paid
 * entitlement, and a free author sees the upgrade prompt on the export screen.
 *
 * What a plan adds is on top of this: exports, more books, more chapters per
 * book, priority job handling, and the extra credits that buy more AI work.
 */
export const FREE_TIER_ENTITLEMENTS: Partial<Record<EntitlementKey, string | number | boolean>> = {
  sourceImports: true,
  maxBooks: 1,
  maxChaptersPerBook: 10,
};

/**
 * The capabilities a paid plan can grant on top of the free tier.
 *
 * These are the entitlements that a plan may write and a refund may withdraw.
 */
export const PAID_ENTITLEMENT_KEYS: readonly EntitlementKey[] = [
  'maxBooks',
  'maxChaptersPerBook',
  'priorityJobs',
  'exports',
];

/**
 * Whether an entitlement allows a given use.
 *
 * A missing entitlement denies the use. The free tier therefore has no
 * entitlements and nothing paid is unlocked for it.
 */
export function entitlementAllows(
  entitlements: Partial<Record<EntitlementKey, string | number | boolean>>,
  key: EntitlementKey,
  required?: number,
): boolean {
  const value = entitlements[key];
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return required === undefined ? value > 0 : value >= required;
  // A string value is compared against the required amount when one is given.
  if (required !== undefined) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= required;
  }
  return value !== '' && value !== 'false';
}

/**
 * The events a provider can send.
 *
 * Only `payment.succeeded` and `invoice.paid` grant credits; every other event changes state
 * but grants nothing.
 */
export const PAYMENT_EVENT_TYPES = [
  'checkout.completed',
  'payment.succeeded',
  'payment.failed',
  'payment.refunded',
  'payment.disputed',
  'payment.dispute_closed',
  'invoice.paid',
  'invoice.payment_failed',
  'subscription.updated',
  'subscription.canceled',
] as const;
export type PaymentEventType = typeof PAYMENT_EVENT_TYPES[number];

/**
 * The events that grant credits.
 *
 * `payment.succeeded` settles a one-time purchase; `invoice.paid` settles a
 * subscription's first period and every renewal.
 */
export const CREDIT_GRANTING_EVENTS: readonly PaymentEventType[] = ['payment.succeeded', 'invoice.paid'];

/**
 * Whether an event grants credits.
 *
 * A completed checkout is not a payment: the money has to have moved. This is
 * the rule that keeps a `checkout.completed` callback from crediting anything.
 */
export function eventGrantsCredits(type: string): boolean {
  return (CREDIT_GRANTING_EVENTS as readonly string[]).includes(type);
}

/**
 * The signature a webhook carries.
 *
 * The header name and the algorithm are part of the contract so a provider
 * change is a configuration change rather than a code change.
 */
export const WEBHOOK_SIGNATURE_HEADER = 'x-ebookstudio-signature';
export const WEBHOOK_SIGNATURE_SCHEME = 'v1';

/**
 * Computes the signature of a webhook body.
 *
 * The signature covers the raw body and a timestamp, so a captured body cannot
 * be replayed indefinitely: the verifier rejects a signature whose timestamp is
 * outside the tolerance.
 */
export function signWebhook(body: string, secret: string, timestamp: number): string {
  return `${WEBHOOK_SIGNATURE_SCHEME}=${hmacHex(secret, `${timestamp}.${body}`)}`;
}

/**
 * Verifies a webhook signature.
 *
 * The comparison is constant-time, so a wrong signature cannot be discovered
 * one character at a time.
 */
export function verifyWebhookSignature(
  body: string,
  secret: string,
  signature: string | undefined,
  timestamp: number,
  toleranceSeconds: number,
  now: number,
): boolean {
  if (!signature) return false;
  const [scheme, provided] = signature.split('=');
  if (scheme !== WEBHOOK_SIGNATURE_SCHEME || !provided) return false;
  if (Math.abs(Math.floor(now / 1000) - timestamp) > toleranceSeconds) return false;
  const expected = hmacHex(secret, `${timestamp}.${body}`);
  return timingSafeEqualHex(expected, provided);
}

/** The HMAC-SHA256 of a message, in lowercase hex. */
export function hmacHex(secret: string, message: string): string {
  // A small, dependency-free HMAC. The shared package is used in the browser
  // too, so it cannot depend on node:crypto.
  const blockSize = 64;
  const keyBytes = utf8Bytes(secret);
  // A key longer than the block size is hashed down first.
  const key = keyBytes.length > blockSize ? sha256Bytes(keyBytes) : keyBytes;

  const outer = new Uint8Array(blockSize);
  const inner = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    outer[i] = (key[i] ?? 0) ^ 0x5c;
    inner[i] = (key[i] ?? 0) ^ 0x36;
  }

  const messageBytes = utf8Bytes(message);
  const innerMessage = new Uint8Array(inner.length + messageBytes.length);
  innerMessage.set(inner);
  innerMessage.set(messageBytes, inner.length);
  const innerHash = sha256Bytes(innerMessage);

  const outerMessage = new Uint8Array(outer.length + innerHash.length);
  outerMessage.set(outer);
  outerMessage.set(innerHash, outer.length);
  return bytesToHex(sha256Bytes(outerMessage));
}

/** Compares two hex strings in constant time. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The UTF-8 bytes of a string. */
function utf8Bytes(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = (code - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return Uint8Array.from(out);
}

/** The lowercase hex of some bytes. */
function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/**
 * SHA-256 of a string, in lowercase hex.
 *
 * A compact implementation so the shared package stays free of a Node
 * dependency and the same code runs in the browser. It is checked against
 * node:crypto by the tests.
 */
export function sha256Hex(message: string): string {
  return bytesToHex(sha256Bytes(utf8Bytes(message)));
}

/** SHA-256 of some bytes. */
function sha256Bytes(input: Uint8Array): Uint8Array {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  const bitLength = input.length * 8;
  // The message is padded with a 0x80 byte and zeros until the length is
  // 56 modulo 64, then eight bytes of big-endian bit length.
  const paddedLength = (Math.floor((input.length + 8) / 64) + 1) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  // The length is a 64-bit big-endian count of bits, in the last eight bytes.
  // A JS number holds the low 32 bits exactly, which is far beyond any message
  // this product handles.
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let i = 0; i < 4; i++) bytes[paddedLength - 8 + i] = (high >>> ((3 - i) * 8)) & 0xff;
  for (let i = 0; i < 4; i++) bytes[paddedLength - 4 + i] = (low >>> ((3 - i) * 8)) & 0xff;

  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      const j = chunk + i * 4;
      w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e;
      e = (d + temp1) >>> 0;
      d = c; c = b; b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (H[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (H[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (H[i] >>> 8) & 0xff;
    out[i * 4 + 3] = H[i] & 0xff;
  }
  return out;
}

