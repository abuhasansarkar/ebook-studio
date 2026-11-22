import { imageGenerationService } from './services/covers/imageGenerationService.js';
import { aiReviewService } from './services/quality/qualityService.js';
import { cleanupAssets } from './services/assets/assetService.js';
import { startEmailDispatcher } from "./services/email/otpDelivery.js";
import { Worker } from "bullmq";
import { workerQueuePrefix, assertCompatible } from "./config/runtime.js";
import { startWorkerHeartbeat } from "./services/runtime/readiness.js";
import { env } from "./config/env.js";
import { redisConnection } from "./config/redis.js";
import { prisma } from "./database/prisma.js";
import { QUEUE_NAMES, closeQueues, startDispatcher, type ExportJobData, type GenerationJobData } from "./queues/index.js";
import { generationService } from "./services/generation/generationService.js";
import { outlineService } from "./services/outline/outlineService.js";
import { exportService } from "./services/exports/exportService.js";
import { closeBrowser } from "./services/exports/pdfRenderer.js";
import { raiseIncident } from "./services/admin/operationsService.js";
import { logger } from "./utils/logger.js";

/**
 * Background worker. Processors are idempotent: BullMQ may re-deliver a stalled job
 * after a crash, and the services resume without duplicating chapters or charges.
 */
const workers = [
  new Worker<GenerationJobData>(QUEUE_NAMES.quality, job => { assertCompatible(job.data); return aiReviewService.process(job.data.generationJobId); }, { connection: redisConnection(), prefix: workerQueuePrefix, concurrency: 2, lockDuration: 180000 }),
  new Worker<GenerationJobData>(QUEUE_NAMES.images, job => { assertCompatible(job.data); return imageGenerationService.process(job.data.generationJobId); }, { connection: redisConnection(), prefix: workerQueuePrefix, concurrency: 1, lockDuration: 180000 }),
  new Worker<GenerationJobData>(QUEUE_NAMES.outline, (job) => { assertCompatible(job.data); return outlineService.process(job.data.generationJobId); }, {
    connection: redisConnection(),
    prefix: workerQueuePrefix,
    concurrency: 5,
  }),
  new Worker<GenerationJobData>(QUEUE_NAMES.chapters, (job) => { assertCompatible(job.data); return generationService.process(job.data.generationJobId); }, {
    connection: redisConnection(),
    prefix: workerQueuePrefix,
    concurrency: 3,
    // Whole-book jobs run for minutes; keep the lock alive generously.
    lockDuration: 120_000,
  }),
  new Worker<ExportJobData>(QUEUE_NAMES.exports, (job) => { assertCompatible(job.data); return exportService.process(job.data.exportId); }, {
    connection: redisConnection(),
    prefix: workerQueuePrefix,
    concurrency: 2,
    lockDuration: 180_000,
  }),
];

for (const w of workers) {
  w.on("failed", (job, err) => {
    logger.error({ err, queue: w.name, jobId: job?.id }, "Job failed");
    if (job && job.attemptsMade >= (job.opts?.attempts ?? 1)) {
      const subjectId = (job.data as { generationJobId?: string; exportId?: string })?.generationJobId 
        ?? (job.data as { generationJobId?: string; exportId?: string })?.exportId 
        ?? (job.id ? String(job.id) : undefined);
      void raiseIncident({
        kind: `queue.${w.name}.exhausted`,
        severity: "warning",
        summary: `Job ${job.id} failed after ${job.attemptsMade} attempt(s) in queue ${w.name}: ${(err as Error).message.slice(0, 300)}`,
        subjectType: "worker_job",
        subjectId,
      }).catch((incidentError) => logger.warn({ err: incidentError }, "Could not record incident for failed job"));
    }
  });
  w.on("error", (err) => logger.error({ err, queue: w.name }, "Worker error"));
}

await Promise.all(workers.map((w) => w.waitUntilReady()));
const stopHeartbeat = await startWorkerHeartbeat(["outline", "chapters", "exports", "images", "quality"]);
const stopDispatcher = startDispatcher();
const stopEmailDispatcher = startEmailDispatcher();
let cleaningAssets = false;
const cleanupTimer = setInterval(() => {
  if (cleaningAssets) return;
  cleaningAssets = true;
  void cleanupAssets().catch(err => logger.error({ err }, 'Asset cleanup failed')).finally(() => { cleaningAssets = false; });
}, 60000);
cleanupTimer.unref();

logger.info({ mock: env.AI_MOCK }, "eBookStudio worker started");

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down worker");
  clearInterval(cleanupTimer);
  stopDispatcher();
  stopEmailDispatcher();
  await stopHeartbeat().catch(() => undefined);
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled([closeQueues(), closeBrowser(), prisma.$disconnect()]);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
