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
import { exportService, reconcileExports } from "./services/exports/exportService.js";
import { installProcessHandlers } from "./utils/processLifecycle.js";
import { creditService } from "./services/credits/creditService.js";
import { closeBrowser } from "./services/exports/pdfRenderer.js";
import { coloringGenerationService } from "./services/coloring/coloringGenerationService.js";
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
  // One job per coloring page; the provider call can take up to 120s.
  new Worker<GenerationJobData>(QUEUE_NAMES.coloring, (job) => { assertCompatible(job.data); return coloringGenerationService.process(job.data.generationJobId); }, {
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
const stopHeartbeat = await startWorkerHeartbeat(["outline", "chapters", "exports", "images", "quality", "coloring"]);
const stopDispatcher = startDispatcher();
const stopEmailDispatcher = startEmailDispatcher();
let cleaningAssets = false;
const cleanupTimer = setInterval(() => {
  if (cleaningAssets) return;
  cleaningAssets = true;
  void cleanupAssets().catch(err => logger.error({ err }, 'Asset cleanup failed')).finally(() => { cleaningAssets = false; });
}, 60000);
cleanupTimer.unref();
// Pages a dead worker or a previous release left generating are failed and their credits released.
let recoveringColoring = false;
const coloringRecoveryTimer = setInterval(() => {
  if (recoveringColoring) return;
  recoveringColoring = true;
  void coloringGenerationService.recoverStale().catch(err => logger.error({ err }, 'Coloring recovery failed')).finally(() => { recoveringColoring = false; });
}, 60000);
coloringRecoveryTimer.unref();
// Exports a dead worker left processing (lapsed lease) or queued without delivery are failed or re-dispatched.
let reconcilingExports = false;
const exportReconcileTimer = setInterval(() => {
  if (reconcilingExports) return;
  reconcilingExports = true;
  void reconcileExports().catch(err => logger.error({ err }, 'Export reconciliation failed')).finally(() => { reconcilingExports = false; });
}, 15_000);
exportReconcileTimer.unref();
// Credits held by synchronous requests (listing, marketing, covers) that crashed before settling are released.
// Job-owned reservations (`job:<id>`) are never swept; their jobs settle them.
let sweepingReservations = false;
const reservationSweepTimer = setInterval(() => {
  if (sweepingReservations) return;
  sweepingReservations = true;
  void creditService.sweepStaleReservations().catch(err => logger.error({ err }, 'Reservation sweep failed')).finally(() => { sweepingReservations = false; });
}, 5 * 60_000);
reservationSweepTimer.unref();

logger.info({ mock: env.AI_MOCK }, "eBookStudio worker started");

installProcessHandlers({
  name: "worker",
  deadlineMs: 25_000,
  shutdown: async () => {
    clearInterval(cleanupTimer);
    clearInterval(coloringRecoveryTimer);
    clearInterval(exportReconcileTimer);
    clearInterval(reservationSweepTimer);
    stopDispatcher();
    stopEmailDispatcher();
    await stopHeartbeat().catch(() => undefined);
    // Long chapter jobs may not stop quickly; their leases expire and another worker resumes them.
    await Promise.race([
      Promise.allSettled(workers.map((w) => w.close())),
      new Promise((resolve) => setTimeout(resolve, 20_000)),
    ]);
    await Promise.allSettled([closeQueues(), closeBrowser(), prisma.$disconnect()]);
  },
});
