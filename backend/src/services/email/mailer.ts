import { env, isTest } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { createOtpMailer, type OtpType } from "./otpMailer.js";

export type { OtpType } from "./otpMailer.js";

const mailer = createOtpMailer({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  user: env.SMTP_USER,
  pass: env.SMTP_PASS,
  from: env.SMTP_FROM,
});

export async function verifySmtp(): Promise<void> {
  await mailer.verify();
}

export async function sendOtpEmail(email: string, otp: string, type: OtpType): Promise<void> {
  // Automated auth tests never send real mail, even if .env contains Gmail credentials.
  if (isTest) return;
  try {
    await mailer.send(email, otp, type);
    logger.info({ type }, "SMTP accepted OTP email");
  } catch (err) {
    const failure = err as { code?: string; responseCode?: number };
    // Avoid logging SMTP response bodies, credentials, recipients, or OTP values.
    logger.error({ code: failure.code, responseCode: failure.responseCode, type }, "Failed to send OTP email");
    throw new Error("Unable to send the email code. Please try again shortly.");
  }
}
