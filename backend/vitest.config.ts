import { defineConfig } from "vitest/config";
import { config } from "dotenv";

const base = config({ path: "../.env", quiet: true }).parsed ?? {};
const dbUrl = process.env.TEST_DATABASE_URL ?? (base.DATABASE_URL ?? "postgresql://ebook:ebook@localhost:5432/ebook_studio").replace(/\/[^/?]+(\?|$)/, "/ebook_studio_test$1");

export default defineConfig({
  test: {
    env: {
      ...base,
      NODE_ENV: "test",
      QUEUE_NAMESPACE: "test",
      AI_MOCK: "1",
      DATABASE_URL: dbUrl,
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/1",
      S3_ENDPOINT: "",
      APP_URL: "http://localhost:3000",
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET ?? "test-secret-test-secret-test-secret",
      // The webhook secret the payment tests sign their events with. It is a
      // test value: the same verification code runs in production with a real
      // secret.
      PAYMENT_WEBHOOK_SECRET: base.PAYMENT_WEBHOOK_SECRET ?? "test-webhook-secret-test-webhook-secret",
      // The tests exercise the local provider, which is deterministic and
      // makes no network call. The Stripe provider is covered by its own
      // tests, which never reach the Stripe API.
      PAYMENT_PROVIDER: "local",
      // The Stripe webhook endpoint signing secret the Stripe provider
      // verifies against. The Stripe tests sign with this same value.
      STRIPE_WEBHOOK_SECRET: "whsec_test_secret_for_stripe_provider_tests",
      // The S13 operations tests raise an alert. The destination is a test
      // value; the same code path runs in production with a real one.
      ALERT_DESTINATION: process.env.TEST_ALERT_DESTINATION ?? "ops-alerts@test.dev",
      STRIPE_SECRET_KEY: "sk_test_00000000000000000000000000000000",
    },
    globalSetup: "tests/global-setup.ts",
    fileParallelism: false,    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
