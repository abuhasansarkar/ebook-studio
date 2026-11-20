import type { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { isTest } from "../config/env.js";

const keyByUser = (req: Request) => req.user?.id ?? ipKeyGenerator(req.ip ?? "unknown");

const json = (message: string) => ({ error: { code: "RATE_LIMITED", message } });

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => isTest,
  message: json("Too many requests. Please slow down."),
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
});
