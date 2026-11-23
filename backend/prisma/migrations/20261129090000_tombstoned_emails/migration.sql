-- CreateTable
CREATE TABLE IF NOT EXISTS "tombstoned_emails" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "deletedBy" TEXT,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tombstoned_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tombstoned_emails_email_key" ON "tombstoned_emails"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tombstoned_emails_email_idx" ON "tombstoned_emails"("email");

-- DropForeignKey
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_userId_fkey";

-- DropForeignKey
ALTER TABLE "asset_references" DROP CONSTRAINT IF EXISTS "asset_references_assetId_fkey";

-- DropForeignKey
ALTER TABLE "asset_references" DROP CONSTRAINT IF EXISTS "asset_references_bookId_fkey";

-- DropForeignKey
ALTER TABLE "quality_reports" DROP CONSTRAINT IF EXISTS "quality_reports_jobId_fkey";

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
