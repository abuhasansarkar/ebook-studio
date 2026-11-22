import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { env, isTest } from "../../config/env.js";
import { queueNamespace, runtimeFingerprint, workerQueuePrefix, PROTOCOL_VERSION } from "../../config/runtime.js";
import { prisma } from "../../database/prisma.js";
import { getRuntimeRedis } from "../../config/redis.js";
import { serviceUnavailable } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { storage } from "../storage/storage.js";

const key = `${workerQueuePrefix}:runtime`;
const TTL = 30_000;
const heartbeatSchema = z.object({
  fingerprint: z.string(), protocol: z.number(), capabilities: z.array(z.string()),
  probeKey: z.string().startsWith("runtime-probes/"), probeHash: z.string(),
});
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

async function readProbe(probeKey: string) {
  const { stream, size } = await storage.getStream(probeKey);
  if (size !== undefined && size > 1024) throw new Error("Invalid probe");
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const data = Buffer.from(chunk);
    bytes += data.length;
    if (bytes > 1024) { stream.destroy(); throw new Error("Invalid probe"); }
    chunks.push(data);
  }
  return hash(Buffer.concat(chunks));
}

export async function startWorkerHeartbeat(capabilities: string[]) {
  const id = randomUUID();
  const probeKey = `runtime-probes/${queueNamespace}/${id}.txt`;
  const content = randomUUID();
  await storage.put(probeKey, Buffer.from(content), "text/plain");
  const probeHash = hash(content);
  if (await readProbe(probeKey) !== probeHash) throw new Error("Worker storage probe failed");
  const client = await getRuntimeRedis();
  const payload = JSON.stringify({ fingerprint: runtimeFingerprint, protocol: PROTOCOL_VERSION, capabilities, probeKey, probeHash });
  let stopped = false;
  let publishing = false;
  const publish = async () => {
    if (publishing || stopped) return;
    publishing = true;
    try {
      await client.set(`${key}:${id}`, payload, "PX", TTL);
      await client.zadd(key, Date.now(), id);
      await client.zremrangebyscore(key, "-inf", Date.now() - TTL);
    } finally { publishing = false; }
  };
  await publish();
  const timer = setInterval(() => { void publish().catch(() => logger.warn("Worker heartbeat failed")); }, 10_000);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    try { await client.zrem(key, id); await client.del(`${key}:${id}`); }
    finally { await storage.remove(probeKey); }
  };
}

async function check() {
  const checks = { database: false, redis: false, workers: false, storage: false };
  await prisma.$queryRaw`SELECT 1`.then(() => { checks.database = true; }).catch(() => undefined);
  try {
    const client = await getRuntimeRedis();
    await client.ping();
    checks.redis = true;
    const ids = await client.zrangebyscore(key, Date.now() - TTL, "+inf", "LIMIT", 0, 50);
    const values = ids.length ? await client.mget(...ids.map((id) => `${key}:${id}`)) : [];
    const available = new Set<string>();
    let validProbe = false;
    for (const value of values) {
      if (!value) continue;
      let data: z.infer<typeof heartbeatSchema>;
      try { data = heartbeatSchema.parse(JSON.parse(value)); } catch { continue; }
      if (data.fingerprint !== runtimeFingerprint || data.protocol !== PROTOCOL_VERSION) continue;
      // A matching path alone cannot prove two containers share their files.
      try { if (await readProbe(data.probeKey) !== data.probeHash) continue; } catch { continue; }
      validProbe = true;
      for (const capability of data.capabilities) available.add(capability);
    }
    checks.storage = validProbe;
    checks.workers = ["outline", "chapters", "exports", "images", "quality", "coloring"].every((c) => available.has(c));
  } catch { /* Readiness is degraded without leaking infrastructure details. */ }
  return checks;
}

export async function runtimeReadiness() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      check(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Readiness timed out")), 3000); }),
    ]);
  } catch { return { database: false, redis: false, workers: false, storage: false }; }
  finally { if (timer) clearTimeout(timer); }
}

export async function assertRuntimeAvailable() {
  // Service tests intentionally execute processors inline; runtime gates have their
  // own integration tests using real queues, heartbeat expiry and private storage.
  if (isTest) return;
  const checks = await runtimeReadiness();
  if (!Object.values(checks).every(Boolean)) throw serviceUnavailable("Book processing is temporarily unavailable. Please try again shortly.");
}
