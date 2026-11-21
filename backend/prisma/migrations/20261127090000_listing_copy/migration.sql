-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "priceInMinorUnits" INTEGER NOT NULL DEFAULT 0,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "confirmed" JSONB NOT NULL DEFAULT '{}',
    "chapterVersions" JSONB NOT NULL,
    "rulesVersion" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listings_userId_bookId_destination_idx" ON "listings"("userId", "bookId", "destination");

-- CreateIndex
CREATE INDEX "listings_bookId_createdAt_idx" ON "listings"("bookId", "createdAt");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
