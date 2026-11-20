import nodemailer from "nodemailer";
import { env, isTest } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

const SUBJECTS = {
  "email-verification": "Verify your eBookStudio email",
  "sign-in": "Your eBookStudio sign-in code",
  "forget-password": "Reset your eBookStudio password",
  "change-email": "Confirm your new eBookStudio email",
} as const;

export type OtpType = keyof typeof SUBJECTS;

export async function sendOtpEmail(email: string, otp: string, type: OtpType): Promise<void> {
  if (isTest) return;
  const subject = SUBJECTS[type];
  const html = `
  <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1f1a17">
    <h2 style="color:#e8603c;margin:0 0 16px">eBookStudio</h2>
    <p>${subject}. Your code is:</p>
    <p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:16px 0">${otp}</p>
    <p style="color:#6b625c;font-size:14px">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
  </div>`;
  try {
    await transporter.sendMail({ from: env.SMTP_FROM, to: email, subject, html, text: `${subject}. Your code is ${otp}` });
  } catch (err) {
    logger.error({ err, email, type }, "Failed to send OTP email");
  }
}
