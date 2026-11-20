import { defineConfig } from "vitest/config";
import { config } from "dotenv";

const base = config({ path: "../.env", quiet: true }).parsed ?? {};
const dbUrl = process.env.TEST_DATABASE_URL ?? (base.DATABASE_URL ?? "postgresql://ebook:ebook@localhost:5432/ebook_studio").replace(/\/[^/?]+(\?|$)/, "/ebook_studio_test$1");

export default defineConfig({
  test: {
    env: {
      ...base,
      NODE_ENV: "test",
      AI_MOCK: "1",
      DATABASE_URL: dbUrl,
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/1",
      S3_ENDPOINT: "",
      APP_URL: "http://localhost:3000",
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET ?? "test-secret-test-secret-test-secret",
    },
    globalSetup: "tests/global-setup.ts",
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
