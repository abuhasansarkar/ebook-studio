import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { prisma } from "./database/prisma.js";
import { closeQueues } from "./queues/index.js";
import { logger } from "./utils/logger.js";

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`eBookStudio API listening on http://localhost:${env.PORT}`);
  if (env.AI_MOCK) logger.warn("AI_MOCK=1 — using the fake AI provider");
  else if (!env.OPENAI_API_KEY) logger.warn("OPENAI_API_KEY is not set — AI features will return 503");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down API");
  server.close();
  await Promise.allSettled([closeQueues(), prisma.$disconnect()]);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
