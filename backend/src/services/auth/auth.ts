import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { env, isProd } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { sendOtpEmail } from "../email/mailer.js";
import { creditService } from "../credits/creditService.js";
import { logger } from "../../utils/logger.js";

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
        // Not awaited: avoids leaking account existence through response timing.
        void sendOtpEmail(email, otp, type);
        if (!isProd) logger.info({ email, type, otp }, "DEV OTP (also visible in Mailpit)");
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

  rateLimit: { enabled: isProd, window: 60, max: 30 },
  advanced: { useSecureCookies: isProd },
});

export const authFeatures = { google: googleEnabled };
