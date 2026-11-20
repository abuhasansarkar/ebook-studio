import nodemailer, { type SendMailOptions } from "nodemailer";

export const OTP_SUBJECTS = {
  "email-verification": "Verify your eBookStudio email",
  "sign-in": "Your eBookStudio sign-in code",
  "forget-password": "Reset your eBookStudio password",
  "change-email": "Confirm your new eBookStudio email",
} as const;
export type OtpType = keyof typeof OTP_SUBJECTS;

interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}
interface MailTransport {
  sendMail(message: SendMailOptions): Promise<{ accepted?: unknown[]; rejected?: unknown[] }>;
  verify(): Promise<unknown>;
}

export function smtpOptions(config: MailConfig) {
  const gmail = config.host.toLowerCase() === "smtp.gmail.com";
  if (gmail && (!config.user || !config.pass)) throw new Error("Gmail SMTP requires SMTP_USER and an App Password in SMTP_PASS.");
  if (gmail && ![465, 587].includes(config.port)) throw new Error("Gmail SMTP must use port 465 or 587.");
  return {
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port === 587,
    auth: config.user ? { user: config.user, pass: gmail ? config.pass.replace(/\s/g, "") : config.pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    tls: { minVersion: "TLSv1.2" as const },
  };
}

export function createOtpMailer(config: MailConfig, transport: MailTransport = nodemailer.createTransport(smtpOptions(config))) {
  return {
    async verify() {
      await transport.verify();
    },
    async send(email: string, otp: string, type: OtpType) {
      if (!/^\d{6}$/.test(otp)) throw new Error("OTP must contain exactly six digits.");
      const subject = OTP_SUBJECTS[type];
      if (!subject) throw new Error("Unsupported OTP email type.");
      const result = await transport.sendMail({
        from: config.from,
        to: email,
        subject,
        html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1f1a17">
          <h2 style="color:#e8603c;margin:0 0 16px">eBookStudio</h2>
          <p>${subject}. Your code is:</p>
          <p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:16px 0">${otp}</p>
          <p style="color:#6b625c;font-size:14px">This code expires 10 minutes after it was requested. If you didn't request it, you can ignore this email.</p>
        </div>`,
        text: `${subject}. Your code is ${otp}. This code expires 10 minutes after it was requested. If you didn't request it, you can ignore this email.`,
      });
      if (!result.accepted?.length || result.rejected?.length) throw new Error("SMTP did not accept the OTP recipient.");
    },
  };
}
