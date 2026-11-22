import type { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env, isTest } from "../config/env.js";
import { RedisRateLimitStore } from "./redisRateLimitStore.js";

const keyByUser = (req: Request) => req.user?.id ?? ipKeyGenerator(req.ip ?? "unknown");

const json = (message: string) => ({ error: { code: "RATE_LIMITED", message } });

/**
 * Counters live in Redis so every API process shares them. A Redis failure
 * lets the request through (and is logged) rather than failing the API.
 */
const shared = (scope: string) => ({ store: new RedisRateLimitStore(scope), passOnStoreError: true });

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.API_RATE_LIMIT_PER_MINUTE,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => isTest,
  message: json("Too many requests. Please slow down."),
  ...shared("api"),
});

/**
 * App-level limit for the routes mounted before `apiLimiter`: Better Auth
 * (which adds its own stricter per-route limits for sign-in, sign-up and
 * codes) and the local checkout.
 */
export const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.AUTH_RATE_LIMIT_PER_MINUTE,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => isTest,
  message: json("Too many requests. Please slow down."),
  ...shared("auth-app"),
});

/** Stricter limit for expensive AI and generation endpoints (applied after requireAuth). */
export const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: keyByUser,
  skip: () => isTest,
  message: json("Too many AI requests. Please wait a minute and try again."),
  ...shared("ai"),
});

/** Support requests: generous for a person, a wall for a script filling the queue. */
export const supportLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: keyByUser,
  skip: () => isTest,
  message: json("You've sent several support requests recently. Please wait a while before sending another."),
  ...shared("support"),
});
