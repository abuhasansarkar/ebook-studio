import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for pure client logic (no DOM, no network). Screens are covered
// end to end by Playwright (`pnpm e2e` at the repo root).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
