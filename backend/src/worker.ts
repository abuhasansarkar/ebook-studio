import { Worker } from "bullmq";
import { env } from "./config/env.js";
import { redisConnection } from "./config/redis.js";
import { prisma } from "./database/prisma.js";
import { QUEUE_NAMES, closeQueues, type ExportJobData, type GenerationJobData } from "./queues/index.js";
import { generationService } from "./services/generation/generationService.js";
import { outlineService } from "./services/outline/outlineService.js";
import { exportService } from "./services/exports/exportService.js";
import { closeBrowser } from "./services/exports/pdfRenderer.js";
import { logger } from "./utils/logger.js";

/**
 * Background worker. Processors are idempotent: BullMQ may re-deliver a stalled job
 * after a crash, and the services resume without duplicating chapters or charges.
 */
const workers = [
  new Worker<GenerationJobData>(QUEUE_NAMES.outline, (job) => outlineService.process(job.data.generationJobId), {
    connection: redisConnection(),
    concurrency: 5,
  }),
  new Worker<GenerationJobData>(QUEUE_NAMES.chapters, (job) => generationService.process(job.data.generationJobId), {
    connection: redisConnection(),
    concurrency: 3,
    // Whole-book jobs run for minutes; keep the lock alive generously.
    lockDuration: 120_000,
  }),
  new Worker<ExportJobData>(QUEUE_NAMES.exports, (job) => exportService.process(job.data.exportId), {
    connection: redisConnection(),
    concurrency: 2,
    lockDuration: 180_000,
  }),
];

for (const w of workers) {
  w.on("failed", (job, err) => logger.error({ err, queue: w.name, jobId: job?.id }, "Job failed"));
  w.on("error", (err) => logger.error({ err, queue: w.name }, "Worker error"));
}

logger.info({ mock: env.AI_MOCK }, "eBookStudio worker started");

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down worker");
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled([closeQueues(), closeBrowser(), prisma.$disconnect()]);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
