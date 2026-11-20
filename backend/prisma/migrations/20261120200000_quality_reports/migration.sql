-- S09: versioned book context and quality reports/findings (additive).
CREATE TABLE "book_contexts" (
 "id" TEXT PRIMARY KEY,
 "bookId" TEXT NOT NULL REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "version" INTEGER NOT NULL CHECK ("version" > 0),
 "data" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "book_contexts_bookId_version_key" ON "book_contexts"("bookId", "version");
CREATE TABLE "quality_reports" (
 "id" TEXT PRIMARY KEY,
 "bookId" TEXT NOT NULL REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "userId" TEXT NOT NULL,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('rules', 'ai')),
 "status" TEXT NOT NULL CHECK ("status" IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
 "rulesVersion" INTEGER NOT NULL,
 "fingerprint" TEXT NOT NULL,
 "inputs" JSONB NOT NULL,
 "summary" JSONB,
 "jobId" TEXT UNIQUE REFERENCES "generation_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completedAt" TIMESTAMP(3)
);
CREATE INDEX "quality_reports_bookId_createdAt_idx" ON "quality_reports"("bookId", "createdAt");
CREATE TABLE "quality_findings" (
 "id" TEXT PRIMARY KEY,
 "reportId" TEXT NOT NULL REFERENCES "quality_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "key" TEXT NOT NULL,
 "ruleId" TEXT NOT NULL,
 "category" TEXT NOT NULL,
 "severity" TEXT NOT NULL CHECK ("severity" IN ('error', 'warning', 'info')),
 "method" TEXT NOT NULL CHECK ("method" IN ('rule', 'heuristic', 'ai')),
 "chapterId" TEXT,
 "anchor" JSONB,
 "message" TEXT NOT NULL,
 "evidence" TEXT NOT NULL DEFAULT '',
 "suggestion" JSONB,
 "needsHumanReview" BOOLEAN NOT NULL DEFAULT false,
 "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'resolved', 'dismissed')),
 "reviewNote" TEXT NOT NULL DEFAULT '',
 "reviewedById" TEXT,
 "reviewedByName" TEXT,
 "reviewedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "quality_findings_reportId_idx" ON "quality_findings"("reportId");
CREATE INDEX "quality_findings_key_idx" ON "quality_findings"("key");
