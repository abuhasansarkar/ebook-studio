import { existsSync } from "node:fs";
import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");

/** An optional URL: unset and empty both mean "not configured". */
const optionalUrl = z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional());

export const imageModelSchema = z.enum(['gpt-image-2.6-sunburst', 'gpt-image-2.6-flare', 'gpt-image-1.5']);

const envSchema = z.object({
  // No default here: production must be stated, and an unset value inside a
  // container is refused below. Outside a container it means development.
  NODE_ENV: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["development", "test", "production"]).optional()),
  PORT: z.coerce.number().default(4000),
  QUEUE_NAMESPACE: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
  STORAGE_DIR: z.string().optional(),
  // Required in production; local development falls back to localhost:3000.
  APP_URL: optionalUrl,
  BETTER_AUTH_URL: optionalUrl,
  /**
   * Which proxies Express trusts for the client address (`req.ip`), which is
   * what every rate limit keys on. `1` = exactly one proxy in front (nginx in
   * docker-compose); a comma list of addresses/subnets or the Express names
   * `loopback`, `linklocal`, `uniquelocal`; `false` = none. `true` trusts the
   * left-most X-Forwarded-For value, which any client can forge, so
   * production refuses it.
   */
  TRUST_PROXY: z.string().trim().default("loopback"),
  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be at least 16 chars"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),

  // Required in production (no silent Mailpit/localhost); development
  // falls back to localhost.
  SMTP_HOST: z.string().trim().optional().default(""),
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
  /** Required in production; development and tests fall back to `local`. */
  PAYMENT_PROVIDER: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() || undefined : value),
    z.enum(["stripe", "local"]).optional(),
  ),
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
  /** Lets a production build use the local test processor. Only for a private
   *  test stack: the local processor grants credits without taking payment. */
  ALLOW_LOCAL_PAYMENTS: bool,
  /** Requests per minute per address across the whole API. Automated browser
   *  test runs raise it; people never come close to the default. */
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(100_000).default(300),
  /** Requests per minute per address to /api/v1/auth/* and the local
   *  checkout. Defaults to API_RATE_LIMIT_PER_MINUTE. Sign-in, sign-up and OTP
   *  routes have their own much stricter Better Auth limits on top. */
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(100_000).optional(),
});

type RawEnv = z.infer<typeof envSchema>;

/** Turns TRUST_PROXY into the value Express's `trust proxy` setting takes. */
export function parseTrustProxy(value: string): boolean | number | string {
  const v = value.trim().toLowerCase();
  if (v === "" || v === "false") return false;
  if (v === "true") return true;
  if (/^\d+$/.test(v)) return Number(v);
  return value.split(",").map((part) => part.trim()).filter(Boolean).join(", ");
}

/** Fills the development defaults once production has been checked. */
function withDefaults(raw: RawEnv) {
  return {
    ...raw,
    NODE_ENV: raw.NODE_ENV ?? "development",
    APP_URL: raw.APP_URL ?? "http://localhost:3000",
    BETTER_AUTH_URL: raw.BETTER_AUTH_URL ?? "http://localhost:3000",
    PAYMENT_PROVIDER: raw.PAYMENT_PROVIDER ?? "local",
    SMTP_HOST: raw.SMTP_HOST || "localhost",
    AUTH_RATE_LIMIT_PER_MINUTE: raw.AUTH_RATE_LIMIT_PER_MINUTE ?? raw.API_RATE_LIMIT_PER_MINUTE,
  };
}

const PLACEHOLDER_SECRET = /change-me|replace-with|example|placeholder/i;

/**
 * Settings that are valid but unsafe to run in production.
 *
 * Each one would start the service in a state that loses money or weakens
 * authentication without any visible error, so production refuses to start
 * instead.
 */
export function unsafeProductionSettings(
  e: Pick<RawEnv, "NODE_ENV" | "PAYMENT_PROVIDER" | "ALLOW_LOCAL_PAYMENTS" | "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET" | "BETTER_AUTH_SECRET" | "PAYMENT_WEBHOOK_SECRET">
    & Partial<Pick<RawEnv, "APP_URL" | "BETTER_AUTH_URL" | "SMTP_HOST" | "TRUST_PROXY">>,
): string[] {
  if (e.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  // A localhost default in production produces broken links and auth
  // callbacks without any error, so the public URLs must be stated.
  if (!e.APP_URL) problems.push("APP_URL must be set to the public URL people open.");
  if (!e.BETTER_AUTH_URL) problems.push("BETTER_AUTH_URL must be set to the public URL the auth routes are served from.");
  if (!e.PAYMENT_PROVIDER) problems.push("PAYMENT_PROVIDER must be set explicitly (stripe, or local with ALLOW_LOCAL_PAYMENTS=true for a private test stack).");
  if (!e.SMTP_HOST) problems.push("SMTP_HOST must name the mail server; sign-up codes cannot be delivered without one.");
  if (e.TRUST_PROXY !== undefined && parseTrustProxy(e.TRUST_PROXY) === true) {
    problems.push("TRUST_PROXY=true trusts a client-supplied X-Forwarded-For, which defeats every rate limit. Use the proxy hop count (1 behind nginx) or its addresses.");
  }
  if (e.PAYMENT_PROVIDER === "local" && !e.ALLOW_LOCAL_PAYMENTS) {
    problems.push("PAYMENT_PROVIDER=local grants credits without taking payment. Set PAYMENT_PROVIDER=stripe, or ALLOW_LOCAL_PAYMENTS=true for a private test stack.");
  }
  if (e.PAYMENT_PROVIDER === "stripe" && (!e.STRIPE_SECRET_KEY || !e.STRIPE_WEBHOOK_SECRET)) {
    problems.push("PAYMENT_PROVIDER=stripe needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.");
  }
  if (PLACEHOLDER_SECRET.test(e.BETTER_AUTH_SECRET)) problems.push("BETTER_AUTH_SECRET is still the placeholder from .env.example.");
  if (PLACEHOLDER_SECRET.test(e.PAYMENT_WEBHOOK_SECRET)) problems.push("PAYMENT_WEBHOOK_SECRET is still the placeholder from .env.example.");
  return problems;
}

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  // The variables are documented in .env.example. Naming the file here saves
  // the reader from searching the repository for where the value belongs.
  console.error("Copy the missing values from .env.example and set them in .env (or the environment the process is started with).");
  process.exit(1);
}

const unsafe = unsafeProductionSettings(parsed.data);
// Every image sets NODE_ENV=production. A container without it was started
// from something else and would silently run with development defaults.
if (parsed.data.NODE_ENV === undefined && existsSync("/.dockerenv")) {
  unsafe.push("NODE_ENV is not set inside a container. Set NODE_ENV=production (or development for a dev container).");
}
if (unsafe.length) {
  console.error("Refusing to start in production:");
  for (const problem of unsafe) console.error(`  ${problem}`);
  process.exit(1);
}

export const env = withDefaults(parsed.data);
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
