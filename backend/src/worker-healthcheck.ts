/**
 * Container health check for the worker (`node dist/worker-healthcheck.js`).
 *
 * A worker publishes an expiring heartbeat to Redis every 10 seconds (see
 * services/runtime/readiness.ts). The check passes when a heartbeat for this
 * exact configuration (namespace + compatibility fingerprint) is fresher than
 * the heartbeat TTL, so a wedged worker that stopped publishing turns
 * unhealthy. It reads Redis only: no database, storage or queue connection.
 */
import { Redis } from "ioredis";
import { env } from "./config/env.js";
import { workerQueuePrefix } from "./config/runtime.js";

// Must match readiness.ts (`${workerQueuePrefix}:runtime`, 30 s TTL).
const key = `${workerQueuePrefix}:runtime`;
const TTL_MS = 30_000;

const client = new Redis(env.REDIS_URL, { lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 1, enableOfflineQueue: false });
client.on("error", () => undefined);
let healthy = false;
try {
  await client.connect();
  healthy = (await client.zcount(key, Date.now() - TTL_MS, "+inf")) > 0;
} catch {
  healthy = false;
} finally {
  client.disconnect();
}
if (!healthy) console.error("No fresh worker heartbeat in Redis");
process.exit(healthy ? 0 : 1);
