import { randomUUID, createHash } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
vi.mock('../src/services/email/mailer.js', () => ({ sendOtpEmail: async (email: string, otp: string, type: import('../src/services/email/otpMailer.js').OtpType) => {
  const { enqueueOtp } = await import('../src/services/email/otpDelivery.js');
  await enqueueOtp(email, otp, type);
} }));
import { prisma } from '../src/database/prisma.js';
import { enqueueOtp, dispatchOtp } from '../src/services/email/otpDelivery.js';
import { closeQueues } from '../src/queues/index.js';
import { getApp, ORIGIN } from './helpers.js';

async function delivery() {
  const email = `${randomUUID()}@test.dev`;
  const otp = '123456';
  const identifier = `email-verification-otp-${email}`;
  const verification = await prisma.verification.create({ data: { id: randomUUID(), identifier, value: `${createHash('sha256').update(otp).digest('base64url')}:0`, expiresAt: new Date(Date.now() + 600000) } });
  const row = await enqueueOtp(email, otp, 'email-verification');
  return { email, otp, row, verification };
}
afterAll(async () => { await closeQueues(); await prisma.$disconnect(); });

describe('durable OTP delivery', () => {
  it('encrypts payloads, retries transient failures, then erases accepted payloads', async () => {
    const { email, otp, row } = await delivery();
    expect(row.payload).not.toContain(email);
    expect(row.payload).not.toContain(otp);
    const sender = vi.fn().mockRejectedValueOnce(new Error('Temporary outage')).mockResolvedValue(undefined);
    await dispatchOtp(row.id, sender);
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: 'queued', attempts: 1, failureCode: 'DELIVERY_RETRY' });
    await prisma.emailDelivery.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(0) } });
    await dispatchOtp(row.id, sender);
    expect(sender).toHaveBeenLastCalledWith(email, otp, 'email-verification');
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: 'accepted', payload: null });
    await dispatchOtp(row.id, sender);
    expect(sender).toHaveBeenCalledTimes(2);
  });

  it('does not send expired, consumed, exhausted or superseded codes', async () => {
    for (const reason of ['expired', 'consumed', 'attempts', 'superseded']) {
      const { row, verification } = await delivery();
      if (reason === 'expired') await prisma.verification.update({ where: { id: verification.id }, data: { expiresAt: new Date(0) } });
      if (reason === 'consumed') await prisma.verification.delete({ where: { id: verification.id } });
      if (reason === 'attempts') await prisma.verification.update({ where: { id: verification.id }, data: { value: verification.value.replace(':0', ':5') } });
      if (reason === 'superseded') await prisma.verification.create({ data: { id: randomUUID(), identifier: verification.identifier, value: 'different-code:0', createdAt: new Date(Date.now() + 100), expiresAt: verification.expiresAt } });
      const sender = vi.fn();
      await dispatchOtp(row.id, sender);
      expect(sender).not.toHaveBeenCalled();
      expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: row.id } })).payload).toBeNull();
    }
  });

  it('claims once across concurrent dispatchers', async () => {
    const { row } = await delivery();
    let release!: () => void;
    let started!: () => void;
    const began = new Promise<void>(resolve => { started = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const sender = vi.fn(async () => { started(); await held; });
    const first = dispatchOtp(row.id, sender);
    await began;
    await dispatchOtp(row.id, sender);
    release();
    await first;
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it('terminates permanent errors, tampering and exhausted retries without exposing payloads', async () => {
    for (const mode of ['auth', 'tamper', 'limit']) {
      const { row } = await delivery();
      if (mode === 'tamper') await prisma.emailDelivery.update({ where: { id: row.id }, data: { payload: 'v1.corrupted' } });
      if (mode === 'limit') await prisma.emailDelivery.update({ where: { id: row.id }, data: { attempts: 4 } });
      const sender = vi.fn().mockRejectedValue(Object.assign(new Error('not logged'), { code: mode === 'auth' ? 'EAUTH' : 'ETIMEDOUT' }));
      await dispatchOtp(row.id, sender);
      expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: 'failed', payload: null });
      if (mode === 'tamper') expect(sender).not.toHaveBeenCalled();
    }
  });

  it('uses the actual Better Auth hash and expiration, and produces a usable verification code', async () => {
    const email = `${randomUUID()}@test.dev`;
    await request(getApp()).post('/api/v1/auth/sign-up/email').set('Origin', ORIGIN).send({ email, password: 'password123', name: 'Outbox test' }).expect(200);
    const verification = await prisma.verification.findFirstOrThrow({ where: { identifier: `email-verification-otp-${email}` }, orderBy: { createdAt: 'desc' } });
    const row = await prisma.emailDelivery.findUniqueOrThrow({ where: { verificationId: verification.id } });
    expect(row.expiresAt).toEqual(verification.expiresAt);
    const sender = vi.fn().mockResolvedValue(undefined);
    await dispatchOtp(row.id, sender);
    const otp = sender.mock.calls[0][1];
    await request(getApp()).post('/api/v1/auth/email-otp/verify-email').set('Origin', ORIGIN).send({ email, otp }).expect(200);
  });
});
