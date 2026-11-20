ALTER TABLE "generation_jobs" ADD COLUMN "inputSnapshot" JSONB,
ADD COLUMN "leaseToken" TEXT, ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
CREATE TABLE "generation_sections" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "jobId" TEXT NOT NULL REFERENCES "generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "chapterId" TEXT NOT NULL,
 "position" INTEGER NOT NULL,
 "kind" TEXT NOT NULL,
 "text" TEXT NOT NULL,
 "inputTokens" INTEGER NOT NULL DEFAULT 0,
 "outputTokens" INTEGER NOT NULL DEFAULT 0,
 "model" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "generation_sections_jobId_chapterId_kind_position_key"
ON "generation_sections"("jobId", "chapterId", "kind", "position");
