import { randomInt } from "node:crypto";
import { env } from "../src/config/env.js";
import { verifySmtp } from "../src/services/email/mailer.js";
import { createOtpMailer, OTP_SUBJECTS, type OtpType } from "../src/services/email/otpMailer.js";

try {
  if (env.NODE_ENV === "test") throw new Error("Run this diagnostic outside NODE_ENV=test.");
  await verifySmtp();
  console.log("SMTP connection, TLS negotiation, and authentication verified.");
  if (process.argv.includes("--send-test")) {
    if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.SMTP_USER)) throw new Error("SMTP_USER must be an email address for self-test delivery.");
    const diagnosticMailer = createOtpMailer({ host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER, pass: env.SMTP_PASS, from: env.SMTP_FROM });
    for (const type of Object.keys(OTP_SUBJECTS) as OtpType[]) {
      await diagnosticMailer.send(env.SMTP_USER, randomInt(0, 1_000_000).toString().padStart(6, "0"), type);
      console.log(`SMTP accepted ${type} test email to the configured SMTP account.`);
    }
    console.log("These diagnostic codes are not account login/reset tokens. Confirm receipt in your inbox or spam folder.");
  }
} catch (err) {
  const failure = err as { code?: string; responseCode?: number };
  console.error("SMTP check failed.", { code: failure.code ?? "DELIVERY_FAILED", responseCode: failure.responseCode });
  process.exitCode = 1;
}
