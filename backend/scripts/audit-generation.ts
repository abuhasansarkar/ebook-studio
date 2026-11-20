/** Read-only cutover audit. Never infer refunds from a missing queue delivery. */
import { prisma } from '../src/database/prisma.js';
try {
  const mismatches = await prisma.$queryRaw<{ userId: string; stored: number; expected: number }[]>`
    SELECT w."userId", w.reserved AS stored, COALESCE(r.expected, 0)::int AS expected
    FROM credit_wallets w LEFT JOIN (
      SELECT t."userId", SUM(-t.amount)::int AS expected FROM credit_transactions t
      WHERE t.type = 'reserve' AND NOT EXISTS (
        SELECT 1 FROM credit_transactions s WHERE s."idempotencyKey" = 'settle:' || t.reference
      ) GROUP BY t."userId"
    ) r ON r."userId" = w."userId"
    WHERE w.reserved <> COALESCE(r.expected, 0)`;
  const review = await prisma.$queryRaw<{ id: string; status: string; reason: string }[]>`
    SELECT j.id, j.status,
      CASE WHEN r.id IS NULL THEN 'missing reservation'
           WHEN j.status IN ('completed', 'failed', 'cancelled') AND s.id IS NULL THEN 'unsettled terminal job'
           ELSE 'legacy active job without snapshot' END AS reason
    FROM generation_jobs j
    LEFT JOIN credit_transactions r ON r."idempotencyKey" = 'reserve:job:' || j.id
    LEFT JOIN credit_transactions s ON s."idempotencyKey" = 'settle:job:' || j.id
    WHERE r.id IS NULL OR (j.status IN ('completed', 'failed', 'cancelled') AND s.id IS NULL)
      OR (j.status IN ('queued', 'running') AND j."inputSnapshot" IS NULL)`;
  console.log(JSON.stringify({ walletMismatches: mismatches, jobsRequiringReview: review }, null, 2));
  if (mismatches.length || review.length) process.exitCode = 1;
} finally { await prisma.$disconnect(); }
