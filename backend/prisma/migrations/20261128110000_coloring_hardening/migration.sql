-- Coloring page generation runs as a background job; the page records its current job.
ALTER TABLE "coloring_pages" ADD COLUMN "generationJobId" TEXT;

-- CreateIndex
CREATE INDEX "coloring_pages_status_updatedAt_idx" ON "coloring_pages"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "coloring_pages_generationJobId_idx" ON "coloring_pages"("generationJobId");
