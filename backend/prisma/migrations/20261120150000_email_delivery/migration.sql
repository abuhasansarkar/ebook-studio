CREATE TABLE "email_deliveries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "verificationId" TEXT NOT NULL,
  "runtimeId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "email_deliveries_verificationId_key" ON "email_deliveries"("verificationId");
CREATE INDEX "email_deliveries_runtimeId_status_nextAttemptAt_idx" ON "email_deliveries"("runtimeId", "status", "nextAttemptAt");
