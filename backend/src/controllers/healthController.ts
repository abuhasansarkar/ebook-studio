import type { Request, Response } from "express";
import { prisma } from "../database/prisma.js";
import { getQueues } from "../queues/index.js";

export const healthController = {
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
