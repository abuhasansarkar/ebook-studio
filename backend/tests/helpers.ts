import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app.js";
import { prisma } from "../src/database/prisma.js";
import { auth } from "../src/services/auth/auth.js";

export const ORIGIN = "http://localhost:3000";
let app: Express | null = null;
export const getApp = () => (app ??= createApp());

/** Creates a verified user and returns a supertest agent carrying its session cookie. */
export async function createUser(prefix = "user") {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.dev`;
  const password = "password123";
  await auth.api.signUpEmail({ body: { email, password, name: prefix } });
  await prisma.user.update({ where: { email }, data: { emailVerified: true } });
  const agent = request.agent(getApp());
  const res = await agent.post("/api/v1/auth/sign-in/email").set("Origin", ORIGIN).send({ email, password });
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${res.text}`);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { agent, user, email };
}

export const brief = (overrides: Record<string, unknown> = {}) => ({
  brief: { topic: "Meal prep for busy parents", chapterCount: 3, wordsPerChapter: 800, ...overrides },
});

/**
 * Grants a user the entitlements a paid plan carries.
 *
 * Paid capabilities are refused without an entitlement, so a test that
 * exercises a paid path has to say which capabilities it is assuming. Writing
 * the rows directly keeps the tests independent of a payment, while the
 * enforcement path stays exactly as it is in production: the request is
 * refused or allowed based on what the user holds.
 */
export async function grantEntitlements(
  userId: string,
  entitlements: Record<string, string | number | boolean>,
  source = "test",
) {
  for (const [key, value] of Object.entries(entitlements)) {
    await prisma.entitlement.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, value, source, sourceId: source },
      update: { value, source, sourceId: source },
    });
  }
}

/**
 * The entitlements a paid plan grants, for a test that needs paid capabilities.
 *
 * These are the paid keys only. Export and private source import are the
 * baseline every author holds, so a test never has to assume them.
 */
export const PAID_ENTITLEMENTS = {
  maxBooks: 25,
  maxChaptersPerBook: 60,
  priorityJobs: true,
  exports: true,
} as const;
