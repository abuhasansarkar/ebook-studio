CREATE TABLE "operations" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
 "requestHash" TEXT NOT NULL, "kind" TEXT NOT NULL, "bookId" TEXT, "resourceId" TEXT,
 "state" TEXT NOT NULL DEFAULT 'submitting', "responseStatus" INTEGER, "responseBody" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "operations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "operations_userId_idempotencyKey_key" ON "operations"("userId", "idempotencyKey");
CREATE INDEX "operations_userId_createdAt_idx" ON "operations"("userId", "createdAt");
CREATE TABLE "queue_dispatches" (
 "id" TEXT NOT NULL PRIMARY KEY, "namespace" TEXT NOT NULL, "queue" TEXT NOT NULL,
 "jobId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "payload" JSONB NOT NULL,
 "dispatchedAt" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "queue_dispatches_namespace_queue_jobId_key" ON "queue_dispatches"("namespace", "queue", "jobId");
CREATE INDEX "queue_dispatches_namespace_dispatchedAt_nextAttemptAt_idx" ON "queue_dispatches"("namespace", "dispatchedAt", "nextAttemptAt");
