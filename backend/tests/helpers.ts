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
