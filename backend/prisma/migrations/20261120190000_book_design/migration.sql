-- S08: immutable interior design versions and design-aware exports (additive).
CREATE TABLE "book_designs" (
 "id" TEXT PRIMARY KEY,
 "bookId" TEXT NOT NULL REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "version" INTEGER NOT NULL,
 "data" JSONB NOT NULL,
 "action" TEXT NOT NULL,
 "detail" TEXT NOT NULL DEFAULT '',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "book_designs_version_positive" CHECK ("version" > 0),
 CONSTRAINT "book_designs_action_known" CHECK ("action" IN ('save', 'template', 'restore'))
);
CREATE UNIQUE INDEX "book_designs_bookId_version_key" ON "book_designs"("bookId", "version");
ALTER TABLE "exports" ADD COLUMN "designVersion" INTEGER;
ALTER TABLE "exports" ADD COLUMN "designSnapshot" JSONB;
ALTER TABLE "exports" ADD COLUMN "diagnostics" JSONB;
