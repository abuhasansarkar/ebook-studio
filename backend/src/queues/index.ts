import type { Tx } from "../services/credits/creditService.js";
import { Queue } from "bullmq";
import { workerQueuePrefix, runtimeFingerprint, PROTOCOL_VERSION, queueNamespace } from "../config/runtime.js";
import { prisma } from "../database/prisma.js";
import { logger } from "../utils/logger.js";
import { redisConnection, closeRuntimeRedis } from "../config/redis.js";

export const QUEUE_NAMES = {
  images: "images",
  quality: "quality",
  outline: "outline",
  chapters: "chapters",
  exports: "exports",
  /** One job per coloring-book page illustration (a `coloring_page` generation job). */
  coloring: "coloring",
} as const;

export interface GenerationJobData {
  generationJobId: string;
  fingerprint: string;
  protocol: number;
}
export interface ExportJobData {
  exportId: string;
  fingerprint: string;
  protocol: number;
}

/**
 * The queue priority a job is dispatched at.
 *
 * A plan with the `priorityJobs` entitlement puts its work ahead of ordinary
 * work in the queue. BullMQ treats a *lower* priority number as more urgent,
 * so a paid job is dispatched at 1 and everything else at 10.
 */
export const JOB_PRIORITY = {
  /** The priority of a job whose author holds the `priorityJobs` entitlement. */
  paid: 1,
  /** The priority of every other job. */
  standard: 10,
} as const;

/**
 * The priority a dispatch row is dispatched at.
 *
 * The flag is recorded on the dispatch row rather than looked up at dispatch
 * time, because the entitlement may have been withdrawn between the job
 * being created and the dispatcher picking it up. Recording the decision at
 * the moment the job was made keeps the two consistent.
 */
export function priorityFor(paid: boolean): number {
  return paid ? JOB_PRIORITY.paid : JOB_PRIORITY.standard;
}

const defaultJobOptions = {
  // Retries happen inside the AI client; job-level failures are finalized by the processor.
  attempts: 1,
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

let queues: { images: Queue<GenerationJobData>; quality: Queue<GenerationJobData>; outline: Queue<GenerationJobData>; chapters: Queue<GenerationJobData>; exports: Queue<ExportJobData>; coloring: Queue<GenerationJobData> } | null = null;

export function getQueues() {
  queues ??= {
    images: new Queue<GenerationJobData>(QUEUE_NAMES.images, { connection: redisConnection(), prefix: workerQueuePrefix, defaultJobOptions }),
    quality: new Queue<GenerationJobData>(QUEUE_NAMES.quality, { connection: redisConnection(), prefix: workerQueuePrefix, defaultJobOptions }),
    outline: new Queue<GenerationJobData>(QUEUE_NAMES.outline, { connection: redisConnection(), prefix: workerQueuePrefix, defaultJobOptions }),
    chapters: new Queue<GenerationJobData>(QUEUE_NAMES.chapters, { connection: redisConnection(), prefix: workerQueuePrefix, defaultJobOptions }),
    exports: new Queue<ExportJobData>(QUEUE_NAMES.exports, { connection: redisConnection(), prefix: workerQueuePrefix, defaultJobOptions }),
    coloring: new Queue<GenerationJobData>(QUEUE_NAMES.coloring, { connection: redisConnection(), prefix: workerQueuePrefix, defaultJobOptions }),
  };
  return queues;
}

/** Can be called inside the same transaction as domain creation and credit reservation. */
export function persistDispatch(tx: Tx, queue: keyof typeof QUEUE_NAMES, jobId: string, paid = false) {
  const payload = { ...(queue === 'exports' ? { exportId: jobId } : { generationJobId: jobId }), fingerprint: runtimeFingerprint, protocol: PROTOCOL_VERSION, priority: priorityFor(paid) };
  return tx.queueDispatch.upsert({
    where: { namespace_queue_jobId: { namespace: queueNamespace, queue, jobId } },
    create: { namespace: queueNamespace, queue, jobId, fingerprint: runtimeFingerprint, payload }, update: {},
  });
}

/** Legacy callers persist first; generation creates its dispatch transactionally. */
async function enqueue(queue: keyof typeof QUEUE_NAMES, jobId: string) {
  const payload = { ...(queue === "exports" ? { exportId: jobId } : { generationJobId: jobId }), fingerprint: runtimeFingerprint, protocol: PROTOCOL_VERSION, priority: JOB_PRIORITY.standard };
  const dispatch = await prisma.queueDispatch.upsert({
    where: { namespace_queue_jobId: { namespace: queueNamespace, queue, jobId } },
    create: { namespace: queueNamespace, queue, jobId, fingerprint: runtimeFingerprint, payload }, update: {},
  });
  await dispatchPending(dispatch.id);
}
export const enqueueOutline = (id: string) => enqueue("outline", id);
export const enqueueChapters = (id: string) => enqueue("chapters", id);
export const enqueueExport = (id: string) => enqueue("exports", id);

export async function dispatchPending(id?: string) {
  const rows = await prisma.queueDispatch.findMany({ where: {
    ...(id ? { id } : {}), namespace: queueNamespace, fingerprint: runtimeFingerprint,
    dispatchedAt: null, nextAttemptAt: { lte: new Date() },
  }, orderBy: { createdAt: "asc" }, take: 50 });
  for (const row of rows) {
    try {
      const queue = getQueues()[row.queue as keyof typeof QUEUE_NAMES];
      if (!queue) throw new Error("Unknown queue");
      // Bound Redis waits so an unavailable broker does not hang the HTTP response.
      const timeout = new Promise<never>((_, reject) => { const t = setTimeout(() => reject(new Error("Dispatch timed out")), 2000); t.unref(); });
      const payload = row.payload as unknown as GenerationJobData & ExportJobData & { priority?: number };
      await Promise.race([queue.add(row.queue, payload, { jobId: row.jobId, priority: payload.priority ?? JOB_PRIORITY.standard }), timeout]);
      await prisma.queueDispatch.update({ where: { id: row.id }, data: { dispatchedAt: new Date(), attempts: { increment: 1 } } });
    } catch {
      await prisma.queueDispatch.update({ where: { id: row.id }, data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(row.attempts, 6))) } });
      logger.warn({ dispatchId: row.id }, "Queue dispatch deferred; durable retry is pending");
    }
  }
}

/** Redis may lose accepted deliveries. Only matching v2 jobs are recoverable here. */
export async function reconcileGenerationDispatches() {
  const rows = await prisma.$queryRaw<{ id: string; jobId: string; queue: string }[]>`
    SELECT d.id, d."jobId", d.queue FROM queue_dispatches d
    JOIN generation_jobs j ON j.id = d."jobId"
    WHERE d.namespace = ${queueNamespace} AND d.fingerprint = ${runtimeFingerprint}
      AND d."dispatchedAt" < NOW() - INTERVAL '30 seconds'
      AND j."inputSnapshot" IS NOT NULL
      AND (j.status = 'queued' OR (j.status = 'running' AND (j."leaseExpiresAt" IS NULL OR j."leaseExpiresAt" < NOW())))
    ORDER BY d."dispatchedAt" ASC LIMIT 10`;
  for (const row of rows) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([(async () => {
        const queue = getQueues()[row.queue as 'outline' | 'chapters' | 'images' | 'quality' | 'coloring'];
        if (!queue) return;
        const delivery = await queue.getJob(row.jobId);
        if (delivery) {
          const state = await delivery.getState();
          if (state !== 'failed' && state !== 'completed') return;
          await delivery.remove();
        }
        await prisma.queueDispatch.updateMany({ where: { id: row.id, fingerprint: runtimeFingerprint }, data: { dispatchedAt: null, nextAttemptAt: new Date() } });
      })(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Reconciliation timed out')), 2000); timeout.unref(); })]);
    } catch { logger.warn({ dispatchId: row.id }, 'Generation dispatch reconciliation deferred'); }
    finally { if (timeout) clearTimeout(timeout); }
  }
}

export function startDispatcher() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await reconcileGenerationDispatches(); await dispatchPending(); } catch { logger.warn("Queue dispatcher unavailable"); } finally { running = false; }
  };
  const timer = setInterval(() => void tick(), 5000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

export async function closeQueues() {
  await closeRuntimeRedis();
  if (!queues) return;
  await Promise.all(Object.values(queues).map((q) => q.close()));
  queues = null;
}
