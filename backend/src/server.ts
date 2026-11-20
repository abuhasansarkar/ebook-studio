import { startEmailDispatcher } from "./services/email/otpDelivery.js";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { prisma } from "./database/prisma.js";
import { closeQueues, startDispatcher } from "./queues/index.js";
import { billingService } from "./services/billing/billingService.js";
import { logger } from "./utils/logger.js";

const stopDispatcher = startDispatcher();
const stopEmailDispatcher = startEmailDispatcher();
const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`eBookStudio API listening on http://localhost:${env.PORT}`);
  if (env.AI_MOCK) logger.warn("AI_MOCK=1 — using the fake AI provider");
  else if (!env.OPENAI_API_KEY) logger.warn("OPENAI_API_KEY is not set — AI features will return 503");
});

// The plan catalog is seeded on start. An existing plan is left alone, so a
// price change is a deliberate edit rather than a side effect of a restart.
billingService.seedPlans().catch((err) => {
  logger.error({ err: (err as Error).message }, "Could not seed the plan catalog");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down API");
  stopDispatcher();
  stopEmailDispatcher();
  server.close();
  await Promise.allSettled([closeQueues(), prisma.$disconnect()]);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
