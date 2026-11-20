import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";

export const QUEUE_NAMES = {
  outline: "outline",
  chapters: "chapters",
  exports: "exports",
} as const;

export interface GenerationJobData {
  generationJobId: string;
}
export interface ExportJobData {
  exportId: string;
}

const defaultJobOptions = {
  // Retries happen inside the AI client; job-level failures are finalized by the processor.
  attempts: 1,
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

let queues: { outline: Queue<GenerationJobData>; chapters: Queue<GenerationJobData>; exports: Queue<ExportJobData> } | null = null;

export function getQueues() {
  queues ??= {
    outline: new Queue<GenerationJobData>(QUEUE_NAMES.outline, { connection: redisConnection(), defaultJobOptions }),
    chapters: new Queue<GenerationJobData>(QUEUE_NAMES.chapters, { connection: redisConnection(), defaultJobOptions }),
    exports: new Queue<ExportJobData>(QUEUE_NAMES.exports, { connection: redisConnection(), defaultJobOptions }),
  };
  return queues;
}

/** BullMQ jobId == our DB id, so the same DB job can never be enqueued twice. */
export async function enqueueOutline(generationJobId: string) {
  await getQueues().outline.add("generate-outline", { generationJobId }, { jobId: generationJobId });
}
export async function enqueueChapters(generationJobId: string) {
  await getQueues().chapters.add("generate-chapters", { generationJobId }, { jobId: generationJobId });
}
export async function enqueueExport(exportId: string) {
  await getQueues().exports.add("export", { exportId }, { jobId: exportId });
}

export async function closeQueues() {
  if (!queues) return;
  await Promise.all(Object.values(queues).map((q) => q.close()));
  queues = null;
}
