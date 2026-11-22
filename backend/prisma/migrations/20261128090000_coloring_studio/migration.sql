-- CreateTable
CREATE TABLE "coloring_plans" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "artStyle" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "lineThickness" TEXT NOT NULL,
    "trimSize" TEXT NOT NULL,
    "bleed" BOOLEAN NOT NULL DEFAULT false,
    "singleSided" BOOLEAN NOT NULL DEFAULT true,
    "pageCount" INTEGER NOT NULL DEFAULT 24,
    "density" TEXT NOT NULL DEFAULT 'balanced',
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coloring_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coloring_pages" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "caption" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assetId" TEXT,
    "qualityChecks" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coloring_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coloring_plans_bookId_key" ON "coloring_plans"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "coloring_pages_bookId_pageNumber_key" ON "coloring_pages"("bookId", "pageNumber");

-- CreateIndex
CREATE INDEX "coloring_pages_bookId_status_idx" ON "coloring_pages"("bookId", "status");

-- AddForeignKey
ALTER TABLE "coloring_plans" ADD CONSTRAINT "coloring_plans_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coloring_pages" ADD CONSTRAINT "coloring_pages_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coloring_pages" ADD CONSTRAINT "coloring_pages_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
