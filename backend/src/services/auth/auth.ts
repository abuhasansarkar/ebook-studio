import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { isDisposableEmail, DISPOSABLE_EMAIL_ERROR_MESSAGE } from "@ebook/shared";
import { env, isProd } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { sendOtpEmail } from "../email/mailer.js";
import { creditService } from "../credits/creditService.js";

export const TOMBSTONED_EMAIL_ERROR_MESSAGE =
  "This email address was previously associated with a deleted account. Deleted accounts and their email addresses cannot be reused for new registrations.";

export async function isTombstonedEmail(email: string): Promise<boolean> {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  const existing = await prisma.tombstonedEmail.findUnique({
    where: { email: normalized },
    select: { id: true },
  });
  return Boolean(existing);
}

const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  appName: "eBookStudio",
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/v1/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL, env.BETTER_AUTH_URL],
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },
  socialProviders: googleEnabled
    ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
    : {},

  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: "hashed",
      sendVerificationOnSignUp: true,
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        if (isDisposableEmail(email)) {
          throw new APIError("BAD_REQUEST", { message: DISPOSABLE_EMAIL_ERROR_MESSAGE });
        }
        if (await isTombstonedEmail(email)) {
          throw new APIError("BAD_REQUEST", { message: TOMBSTONED_EMAIL_ERROR_MESSAGE });
        }
        // Persist the encrypted delivery before returning; eligible SMTP failures retry.
        // Better Auth keeps auth responses neutral, including unknown accounts.
        try {
          await sendOtpEmail(email, otp, type);
        } catch {
          throw new APIError("SERVICE_UNAVAILABLE", { message: "Unable to send the email code. Please try again shortly." });
        }
      },
    }),
  ],

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (isDisposableEmail(user.email)) {
            throw new APIError("BAD_REQUEST", { message: DISPOSABLE_EMAIL_ERROR_MESSAGE });
          }
          if (await isTombstonedEmail(user.email)) {
            throw new APIError("BAD_REQUEST", { message: TOMBSTONED_EMAIL_ERROR_MESSAGE });
          }
          return { data: user };
        },
        after: async (user) => {
          await creditService.grantSignupBonus(user.id);
        },
      },
    },
  },

  rateLimit: { enabled: isProd, window: 60, max: 30 },
  advanced: { useSecureCookies: isProd },
});

export const authFeatures = { google: googleEnabled };
