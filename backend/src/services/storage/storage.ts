import { createReadStream } from "node:fs";
import { mkdir, writeFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

/**
 * S3-compatible object storage (MinIO in dev). Falls back to the local filesystem
 * when S3_ENDPOINT is not configured.
 */
const DEFAULT_STORAGE = fileURLToPath(new URL("../../../storage", import.meta.url));
const LOCAL_DIR = path.resolve(env.STORAGE_DIR || DEFAULT_STORAGE);
const useS3 = Boolean(env.S3_ENDPOINT);

const s3 = useS3
  ? new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    })
  : null;

let bucketReady: Promise<void> | null = null;

function ensureBucket(): Promise<void> {
  if (!s3) return Promise.resolve();
  bucketReady ??= (async () => {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
      logger.info({ bucket: env.S3_BUCKET }, "Created storage bucket");
    }
  })().catch((err) => {
    bucketReady = null;
    throw err;
  });
  return bucketReady;
}

function localPath(key: string) {
  const p = path.resolve(LOCAL_DIR, key);
  if (!p.startsWith(LOCAL_DIR + path.sep)) throw new Error("Invalid storage key");
  return p;
}

export const storage = {
  async remove(key: string): Promise<void> {
    if (s3) {
      await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      return;
    }
    await unlink(localPath(key)).catch((err: NodeJS.ErrnoException) => { if (err.code !== "ENOENT") throw err; });
  },
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (s3) {
      await ensureBucket();
      await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
      return;
    }
    const file = localPath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  },

  async getStream(key: string): Promise<{ stream: Readable; size?: number }> {
    if (s3) {
      const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      return { stream: res.Body as Readable, size: res.ContentLength };
    }
    const file = localPath(key);
    const info = await stat(file);
    return { stream: createReadStream(file), size: info.size };
  },

  /** The whole file as one buffer. */
  async get(key: string): Promise<Buffer> {
    const { stream } = await storage.getStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  },
};
