import type { ConnectionOptions } from "bullmq";
import { env } from "./env.js";

/** BullMQ connection options parsed from REDIS_URL. */
export function redisConnection(): ConnectionOptions {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
    // Required by BullMQ workers.
    maxRetriesPerRequest: null,
  };
}

// Readiness uses a bounded connection independent of BullMQ's worker reconnect policy.
let runtimeClient: Promise<import("ioredis").Redis> | null = null;
export function getRuntimeRedis() {
  runtimeClient ??= (async () => {
    const { Redis } = await import("ioredis");
    const client = new Redis(env.REDIS_URL, { lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 1, enableOfflineQueue: false });
    client.on("error", () => undefined);
    try { await client.connect(); return client; }
    catch (err) { client.disconnect(); runtimeClient = null; throw err; }
  })();
  return runtimeClient;
}
export async function closeRuntimeRedis() {
  const current = runtimeClient;
  runtimeClient = null;
  const client = await current?.catch(() => null);
  if (client) { try { await client.quit(); } finally { client.disconnect(); } }
}
