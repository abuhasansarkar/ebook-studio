import pino from "pino";
import { env, isProd, isTest } from "../config/env.js";

export const logger = pino({
  level: isTest ? "silent" : isProd ? "info" : "debug",
  redact: ["req.headers.cookie", "req.headers.authorization", "*.password", "*.otp"],
  transport: !isProd && !isTest ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } : undefined,
  base: { env: env.NODE_ENV },
});
