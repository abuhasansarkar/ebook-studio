-- CreateTable
CREATE TABLE "distribution_packages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'assembling',
    "rulesVersion" TEXT NOT NULL DEFAULT '',
    "files" JSONB NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "checks" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "chapterVersions" JSONB NOT NULL,
    "storageKey" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distribution_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publishing_statuses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'not_prepared',
    "externalReference" TEXT,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publishing_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "distribution_packages_userId_bookId_createdAt_idx" ON "distribution_packages"("userId", "bookId", "createdAt");

-- CreateIndex
CREATE INDEX "distribution_packages_status_idx" ON "distribution_packages"("status");

-- CreateIndex
CREATE INDEX "publishing_statuses_bookId_idx" ON "publishing_statuses"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "publishing_statuses_userId_bookId_destination_key" ON "publishing_statuses"("userId", "bookId", "destination");

-- AddForeignKey
ALTER TABLE "distribution_packages" ADD CONSTRAINT "distribution_packages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_packages" ADD CONSTRAINT "distribution_packages_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishing_statuses" ADD CONSTRAINT "publishing_statuses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishing_statuses" ADD CONSTRAINT "publishing_statuses_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
