import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { env, isProd } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { sendOtpEmail } from "../email/mailer.js";
import { creditService } from "../credits/creditService.js";
import { CLIENT_IP_HEADER } from "../../middleware/clientIp.js";
import { betterAuthRateLimitStorage } from "../../middleware/redisRateLimitStore.js";

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
        after: async (user) => {
          await creditService.grantSignupBonus(user.id);
        },
      },
    },
  },

  // Counters are kept in Redis so all API processes share them (the default
  // is per-process memory). Better Auth's built-in stricter rules for sign-in,
  // sign-up and code requests still apply on top of the 30/min default.
  rateLimit: { enabled: isProd, window: 60, max: 30, customStorage: betterAuthRateLimitStorage },
  advanced: {
    useSecureCookies: isProd,
    // The client address comes from Express (`req.ip`, resolved with
    // TRUST_PROXY) via a header the app overwrites on every request, never
    // from a forwarded header a client could write. See middleware/clientIp.ts.
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
  },
});

export const authFeatures = { google: googleEnabled };
