import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { env, isTest } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';
import { createOtpMailer, type OtpType } from './otpMailer.js';

const key = createHmac('sha256', env.BETTER_AUTH_SECRET).update('ebookstudio:otp-delivery:v1').digest();
// Mailpit and Gmail processes sharing a DB must never exchange delivery records.
export const emailRuntimeId = createHmac('sha256', key).update(JSON.stringify([env.DATABASE_URL, env.QUEUE_NAMESPACE ?? env.NODE_ENV, env.SMTP_HOST, env.SMTP_PORT, env.SMTP_USER, env.SMTP_PASS, env.SMTP_FROM])).digest('hex');
const transport = createOtpMailer({ host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER, pass: env.SMTP_PASS, from: env.SMTP_FROM });
type Payload = { email: string; otp: string; type: OtpType };
type Sender = (email: string, otp: string, type: OtpType) => Promise<void>;
const digest = (otp: string) => createHash('sha256').update(otp).digest('base64url');

function encrypt(payload: Payload, verificationId: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(verificationId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}
function decrypt(value: string, verificationId: string): Payload {
  const [version, nonce, tag, ciphertext] = value.split('.');
  if (version !== 'v1' || !nonce || !tag || !ciphertext) throw new Error('Invalid encrypted payload');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'));
  decipher.setAAD(Buffer.from(verificationId));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')) as Payload;
}

/** Matches Better Auth 1.7's hashed OTP representation. Integration tests pin it. */
export async function enqueueOtp(email: string, otp: string, type: OtpType) {
  if (!/^\d{6}$/.test(otp)) throw new Error('Invalid OTP');
  const identifier = type === 'change-email'
    ? { startsWith: 'change-email-otp-', endsWith: `:${email.toLowerCase()}` }
    : `${type}-otp-${email.toLowerCase()}`;
  const verification = await prisma.verification.findFirst({
    where: { identifier, value: { startsWith: `${digest(otp)}:` }, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!verification) throw new Error('No current verification for delivery');
  return prisma.emailDelivery.upsert({ where: { verificationId: verification.id }, create: {
    verificationId: verification.id, runtimeId: emailRuntimeId, type,
    expiresAt: verification.expiresAt, payload: encrypt({ email, otp, type }, verification.id),
  }, update: {} });
}

async function eligibility(verificationId: string, payload: Payload): Promise<'eligible' | 'expired' | 'superseded'> {
  const record = await prisma.verification.findUnique({ where: { id: verificationId } });
  if (!record) return 'superseded'; // consumed, revoked or deleted
  if (record.expiresAt.getTime() <= Date.now() + 30_000) return 'expired';
  const latest = await prisma.verification.findFirst({ where: { identifier: record.identifier }, orderBy: { createdAt: 'desc' } });
  const [hash, attempts] = record.value.split(':');
  if (latest?.id !== record.id || hash !== digest(payload.otp) || Number(attempts) >= 5) return 'superseded';
  return 'eligible';
}

export async function dispatchOtp(id?: string, sender?: Sender) {
  // Tests must inject a captured transport explicitly; never use .env Gmail.
  if (isTest && !sender) return;
  await prisma.emailDelivery.updateMany({ where: { expiresAt: { lte: new Date() }, payload: { not: null } }, data: { status: 'expired', payload: null, leaseToken: null, leaseExpiresAt: null } });
  await prisma.emailDelivery.deleteMany({ where: { payload: null, updatedAt: { lt: new Date(Date.now() - 14 * 86400000) } } });
  const rows = await prisma.emailDelivery.findMany({ where: {
    ...(id ? { id } : {}), runtimeId: emailRuntimeId, payload: { not: null }, expiresAt: { gt: new Date() },
    OR: [{ status: 'queued', nextAttemptAt: { lte: new Date() } }, { status: 'sending', leaseExpiresAt: { lt: new Date() } }],
  }, orderBy: { createdAt: 'asc' }, take: 10 });
  for (const row of rows) {
    const token = randomUUID();
    const claimed = await prisma.emailDelivery.updateMany({ where: {
      id: row.id, runtimeId: emailRuntimeId, attempts: row.attempts, payload: { not: null },
      OR: [{ status: 'queued', nextAttemptAt: { lte: new Date() } }, { status: 'sending', leaseExpiresAt: { lt: new Date() } }],
    }, data: { status: 'sending', attempts: { increment: 1 }, leaseToken: token, leaseExpiresAt: new Date(Date.now() + 120000) } });
    if (!claimed.count) continue;
    const finish = (status: string, failureCode?: string) => prisma.emailDelivery.updateMany({ where: { id: row.id, leaseToken: token }, data: { status, payload: null, leaseToken: null, leaseExpiresAt: null, failureCode: failureCode ?? null } });
    let payload: Payload;
    try { payload = decrypt(row.payload!, row.verificationId); }
    catch { await finish('failed', 'PAYLOAD_UNREADABLE'); continue; }
    try {
      if (row.attempts >= 5) { await finish('failed', 'RETRY_LIMIT'); continue; }
      const status = await eligibility(row.verificationId, payload);
      if (status !== 'eligible') { await finish(status); continue; }
      // SMTP cannot be in the auth DB transaction. A code revoked during SMTP
      // remains invalid to Better Auth even if the server accepts the message.
      await (sender ?? transport.send)(payload.email, payload.otp, payload.type);
      await finish('accepted');
      logger.info({ deliveryId: row.id, type: row.type }, 'SMTP accepted OTP delivery');
    } catch (error) {
      const failure = error as { code?: string; responseCode?: number };
      const permanent = failure.code === 'EAUTH' || (typeof failure.responseCode === 'number' && failure.responseCode >= 500 && failure.responseCode < 600);
      const code = permanent ? 'SMTP_PERMANENT' : 'DELIVERY_RETRY';
      if (permanent || row.attempts + 1 >= 5) await finish('failed', code);
      else await prisma.emailDelivery.updateMany({ where: { id: row.id, leaseToken: token }, data: { status: 'queued', leaseToken: null, leaseExpiresAt: null, failureCode: code, nextAttemptAt: new Date(Date.now() + 15000 * 2 ** row.attempts) } });
      logger.warn({ deliveryId: row.id, type: row.type, code }, 'OTP delivery deferred or failed');
    }
  }
}

export function startEmailDispatcher() {
  let active = false;
  const tick = async () => {
    if (active) return;
    active = true;
    try { await dispatchOtp(); } catch { logger.warn('OTP dispatcher unavailable'); } finally { active = false; }
  };
  const timer = setInterval(() => void tick(), 5000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
