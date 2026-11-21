-- CreateTable
CREATE TABLE "marketing_drafts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "outputType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "content" TEXT NOT NULL DEFAULT '',
    "tone" TEXT NOT NULL DEFAULT 'clear',
    "audience" TEXT,
    "instruction" TEXT,
    "chapterVersions" JSONB NOT NULL,
    "rulesVersion" TEXT NOT NULL DEFAULT '',
    "flags" JSONB NOT NULL,
    "creditsCharged" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_graphics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "subhead" TEXT,
    "callToAction" TEXT,
    "textColor" TEXT NOT NULL DEFAULT '#1b1b1f',
    "backgroundColor" TEXT NOT NULL DEFAULT '#f5f1e8',
    "usedCover" BOOLEAN NOT NULL DEFAULT false,
    "storageKey" TEXT,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_graphics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_samples" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "chapterIds" JSONB NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'pdf',
    "chapterVersions" JSONB NOT NULL,
    "storageKey" TEXT,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_drafts_userId_bookId_createdAt_idx" ON "marketing_drafts"("userId", "bookId", "createdAt");

-- CreateIndex
CREATE INDEX "marketing_drafts_bookId_outputType_idx" ON "marketing_drafts"("bookId", "outputType");

-- CreateIndex
CREATE INDEX "marketing_graphics_userId_bookId_createdAt_idx" ON "marketing_graphics"("userId", "bookId", "createdAt");

-- CreateIndex
CREATE INDEX "marketing_samples_userId_bookId_createdAt_idx" ON "marketing_samples"("userId", "bookId", "createdAt");

-- AddForeignKey
ALTER TABLE "marketing_drafts" ADD CONSTRAINT "marketing_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_drafts" ADD CONSTRAINT "marketing_drafts_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_graphics" ADD CONSTRAINT "marketing_graphics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_graphics" ADD CONSTRAINT "marketing_graphics_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_samples" ADD CONSTRAINT "marketing_samples_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_samples" ADD CONSTRAINT "marketing_samples_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
