import { createHmac } from "node:crypto";
import path from "node:path";
import { env } from "./env.js";

export const PROTOCOL_VERSION = 6;
export const queueNamespace = env.QUEUE_NAMESPACE ?? env.NODE_ENV;
export const queuePrefix = `ebook-${queueNamespace}`;

// A keyed digest compares effective configuration without publishing credentials or URLs.
// Credentials are intentionally included: a consumer with different access is incompatible.
export function compatibilityFingerprint(config = env): string {
  return createHmac("sha256", config.BETTER_AUTH_SECRET).update(JSON.stringify({
    protocol: PROTOCOL_VERSION,
    database: config.DATABASE_URL,
    storage: config.S3_ENDPOINT ? [config.S3_ENDPOINT, config.S3_BUCKET, config.S3_REGION, config.S3_ACCESS_KEY, config.S3_SECRET_KEY, config.S3_FORCE_PATH_STYLE]
      : path.resolve(config.STORAGE_DIR || path.join(process.cwd(), "storage")),
    mock: config.AI_MOCK,
    imageModel: config.OPENAI_IMAGE_MODEL,
    imageCredits: config.IMAGE_GENERATION_CREDITS,
    qualityCredits: config.QUALITY_REVIEW_CREDITS,
    textModel: config.OPENAI_TEXT_MODEL,
    qualityModel: config.OPENAI_QUALITY_MODEL,
  })).digest("hex");
}
export const runtimeFingerprint = compatibilityFingerprint();

// Fingerprint-specific queues prevent incompatible consumers from taking a job, even
// if they accidentally share a namespace. Readiness still detects absent workers.
export const workerQueuePrefix = `${queuePrefix}-${runtimeFingerprint.slice(0, 24)}`;
export function assertCompatible(data: { fingerprint?: string; protocol?: number }) {
  if (data.fingerprint !== runtimeFingerprint || data.protocol !== PROTOCOL_VERSION) throw new Error("Incompatible queue job configuration");
}
