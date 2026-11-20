CREATE TABLE "assets" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
 "storageKey" TEXT NOT NULL UNIQUE, "status" TEXT NOT NULL DEFAULT 'processing',
 "mediaType" TEXT NOT NULL DEFAULT 'image/webp', "sha256" TEXT NOT NULL,
 "width" INTEGER NOT NULL, "height" INTEGER NOT NULL, "bytes" INTEGER NOT NULL,
 "alt" TEXT NOT NULL DEFAULT '', "caption" TEXT NOT NULL DEFAULT '',
 "provenance" TEXT NOT NULL DEFAULT 'user_upload',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "assets_userId_status_id_idx" ON "assets"("userId", "status", "id");
CREATE TABLE "asset_references" (
 "assetId" TEXT NOT NULL REFERENCES "assets"("id") ON DELETE RESTRICT,
 "bookId" TEXT NOT NULL REFERENCES "books"("id") ON DELETE RESTRICT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("assetId", "bookId")
);
