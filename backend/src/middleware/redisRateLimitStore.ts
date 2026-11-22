import type { IncrementResponse, Options, Store } from "express-rate-limit";
import { getRuntimeRedis } from "../config/redis.js";
import { queuePrefix } from "../config/runtime.js";
import { logger } from "../utils/logger.js";

/**
 * Rate-limit counters shared by every API process through Redis.
 *
 * An in-memory counter is per process, so with two API replicas (or a
 * restart) a client gets a fresh allowance. The counters here are fixed
 * windows: the first hit creates the key with the window as its expiry, and
 * each hit increments it in one atomic script.
 */
const HIT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

/** Records one hit and returns the count in the window and the ms left in it. */
export async function hit(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }> {
  const client = await getRuntimeRedis();
  const [count, ttlMs] = (await client.eval(HIT, 1, key, String(windowMs))) as [number, number];
  return { count: Number(count), ttlMs: Number(ttlMs) };
}

/** Namespaced, so stacks that share a Redis never share counters. */
export const rateLimitKey = (scope: string, key: string) => `${queuePrefix}:rl:${scope}:${key}`;

/** An express-rate-limit store backed by Redis. */
export class RedisRateLimitStore implements Store {
  windowMs = 60_000;
  /** Counters are shared between processes, not local to this one. */
  localKeys = false;

  constructor(private readonly scope: string) {}

  get prefix() {
    return rateLimitKey(this.scope, "");
  }

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const { count, ttlMs } = await hit(rateLimitKey(this.scope, key), this.windowMs);
    return { totalHits: count, resetTime: new Date(Date.now() + ttlMs) };
  }

  async decrement(key: string) {
    const client = await getRuntimeRedis();
    await client.decr(rateLimitKey(this.scope, key));
  }

  async resetKey(key: string) {
    const client = await getRuntimeRedis();
    await client.del(rateLimitKey(this.scope, key));
  }
}

/**
 * Better Auth's rate-limit storage, on the same Redis counters.
 *
 * Better Auth keeps its limits in process memory by default, which a second
 * API replica or a restart resets. If Redis is unreachable the request is
 * allowed and the failure logged: the whole API depends on Redis anyway, and
 * refusing every sign-in would turn a Redis blip into an outage.
 */
export const betterAuthRateLimitStorage = {
  async consume(key: string, rule: { window: number; max: number }) {
    try {
      const { count, ttlMs } = await hit(rateLimitKey("auth", key), rule.window * 1000);
      if (count <= rule.max) return { allowed: true, retryAfter: null };
      return { allowed: false, retryAfter: Math.max(1, Math.ceil(ttlMs / 1000)) };
    } catch (err) {
      logger.warn({ err }, "Auth rate-limit storage unavailable; allowing the request");
      return { allowed: true, retryAfter: null };
    }
  },
};
