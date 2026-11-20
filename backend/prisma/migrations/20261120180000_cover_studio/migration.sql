ALTER TABLE "generation_jobs" ADD COLUMN "assetId" TEXT;
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "cover_designs" (
 "id" TEXT PRIMARY KEY,
 "bookId" TEXT NOT NULL REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "version" INTEGER NOT NULL,
 "data" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "cover_designs_bookId_version_key" ON "cover_designs"("bookId", "version");
