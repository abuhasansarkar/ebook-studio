import { runtimeReadiness } from "../services/runtime/readiness.js";
import type { Request, Response } from "express";
import { prisma } from "../database/prisma.js";
import { getQueues } from "../queues/index.js";

export const healthController = {
  live(_req: Request, res: Response) { res.json({ status: "alive" }); },
  async ready(_req: Request, res: Response) {
    const checks = await runtimeReadiness();
    const ready = Object.values(checks).every(Boolean);
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "degraded", checks });
  },
  async check(_req: Request, res: Response) {
    const checks = { database: false, redis: false };
    await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => (checks.database = true)).catch(() => undefined),
      getQueues()
        .outline.getJobCounts("waiting")
        .then(() => (checks.redis = true))
        .catch(() => undefined),
    ]);
    const ok = checks.database && checks.redis;
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", checks });
  },
};
