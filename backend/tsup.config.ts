import { defineConfig } from "tsup";

export default defineConfig({
  // worker-healthcheck is the worker container's HEALTHCHECK (docker-compose.yml).
  entry: ["src/server.ts", "src/worker.ts", "src/worker-healthcheck.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Bundle the workspace package (it ships TypeScript source).
  noExternal: ["@ebook/shared"],
});
