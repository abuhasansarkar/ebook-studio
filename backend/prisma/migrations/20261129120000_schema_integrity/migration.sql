-- Schema integrity: financial history survives account deletion, missing
-- foreign keys are added, foreign keys and sweep columns are indexed, and the
-- one-active-job-per-book rule becomes a database invariant.

-- Preflight: the partial unique index below would fail on a database that
-- already holds two active book-wide jobs for one book. assertIdle has
-- prevented that since S03, so finding one means the ledger needs an operator
-- (run `pnpm --filter backend generation:audit`), not a silent repair here.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "generation_jobs"
    WHERE status IN ('queued', 'running') AND type IN ('outline', 'chapters', 'image', 'quality')
    GROUP BY "bookId" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Some books have more than one active generation job. Reconcile them (generation:audit) before applying 20261129120000_schema_integrity.';
  END IF;
END $$;

-- Orphans: rows whose parent never had a foreign key. A checkpoint for a
-- chapter that no longer exists can never be resumed; a quality report for an
-- account that no longer exists can never be read.
DELETE FROM "generation_sections" s
WHERE NOT EXISTS (SELECT 1 FROM "chapters" c WHERE c.id = s."chapterId");

DELETE FROM "quality_reports" r
WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = r."userId");

-- DropForeignKey
ALTER TABLE "credit_transactions" DROP CONSTRAINT "credit_transactions_userId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_userId_fkey";

-- AlterTable
ALTER TABLE "research_sources" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "asset_references_bookId_idx" ON "asset_references"("bookId");

-- CreateIndex
CREATE INDEX "chapter_source_links_bookId_idx" ON "chapter_source_links"("bookId");

-- CreateIndex
CREATE INDEX "coloring_pages_assetId_idx" ON "coloring_pages"("assetId");

-- CreateIndex
CREATE INDEX "email_deliveries_expiresAt_idx" ON "email_deliveries"("expiresAt");

-- CreateIndex
CREATE INDEX "exports_userId_idx" ON "exports"("userId");

-- CreateIndex
CREATE INDEX "exports_status_idx" ON "exports"("status");

-- CreateIndex
CREATE INDEX "generation_jobs_status_leaseExpiresAt_idx" ON "generation_jobs"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "generation_jobs_assetId_idx" ON "generation_jobs"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "generation_jobs_one_active_per_book_key" ON "generation_jobs"("bookId") WHERE (status IN ('queued', 'running') AND type IN ('outline', 'chapters', 'image', 'quality'));

-- CreateIndex
CREATE INDEX "generation_sections_chapterId_idx" ON "generation_sections"("chapterId");

-- CreateIndex
CREATE INDEX "payments_planId_idx" ON "payments"("planId");

-- CreateIndex
CREATE INDEX "quality_reports_userId_idx" ON "quality_reports"("userId");

-- CreateIndex
CREATE INDEX "session_expiresAt_idx" ON "session"("expiresAt");

-- CreateIndex
CREATE INDEX "subscriptions_planId_idx" ON "subscriptions"("planId");

-- CreateIndex
CREATE INDEX "verification_expiresAt_idx" ON "verification"("expiresAt");

-- AddForeignKey
ALTER TABLE "generation_sections" ADD CONSTRAINT "generation_sections_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
