import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");

export const imageModelSchema = z.enum(['gpt-image-2.6-sunburst', 'gpt-image-2.6-flare', 'gpt-image-1.5']);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  QUEUE_NAMESPACE: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
  STORAGE_DIR: z.string().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be at least 16 chars"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),

  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().default("eBookStudio <no-reply@ebookstudio.local>"),

  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_IMAGE_MODEL: imageModelSchema.default('gpt-image-2.6-sunburst'),
  IMAGE_GENERATION_CREDITS: z.coerce.number().int().min(1).max(1000).default(20),
  /** Product credits per chapter for the optional AI quality review. */
  QUALITY_REVIEW_CREDITS: z.coerce.number().int().min(1).max(1000).default(5),
  OPENAI_TEXT_MODEL: z.string().default("gpt-5-mini"),
  OPENAI_QUALITY_MODEL: z.string().default("gpt-5"),
  OPENAI_MAX_RETRIES: z.coerce.number().default(3),
  OPENAI_TIMEOUT_MS: z.coerce.number().default(120_000),
  OPENAI_REASONING_EFFORT: z.enum(["", "minimal", "low", "medium", "high"]).default(""),
  AI_MOCK: bool,

  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("ebook-studio"),
  S3_ACCESS_KEY: z.string().optional().default(""),
  S3_SECRET_KEY: z.string().optional().default(""),
  S3_FORCE_PATH_STYLE: bool,

  // ---------- Payments (S12) ----------
  /** The secret a provider signs its webhooks with. A webhook without a valid
   *  signature is refused, so this must never be a default value in production. */
  PAYMENT_WEBHOOK_SECRET: z.string().min(16, "PAYMENT_WEBHOOK_SECRET must be at least 16 chars"),
  /** How old a webhook signature may be, in seconds. */
  PAYMENT_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  /** Which payment processor this build talks to: `stripe` or `local`. */
  PAYMENT_PROVIDER: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
    z.enum(["stripe", "local"]),
  ).default("local"),
  /** Stripe's secret API key. Test mode keys start with `sk_test_`. */
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  /** Stripe's publishable key, used by the browser to open the checkout page. */
  STRIPE_PUBLISHABLE_KEY: z.string().optional().default(""),
  /** Stripe's webhook endpoint signing secret (`whsec_...`). */
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),

  // ---------- Operations (S13) ----------
  /** Where an operational alert is delivered. Empty means alerts are refused
   *  rather than silently dropped somewhere nobody reads. */
  ALERT_DESTINATION: z.string().optional().default(""),
  /** Where a backup is written. */
  BACKUP_DIR: z.string().optional().default(""),
  /** The container that holds PostgreSQL, used when the client tools are not
   *  on the host. */
  PG_CONTAINER: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  // The variables are documented in .env.example. Naming the file here saves
  // the reader from searching the repository for where the value belongs.
  console.error("Copy the missing values from .env.example and set them in .env (or the environment the process is started with).");
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
