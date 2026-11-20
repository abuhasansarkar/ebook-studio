CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "contentJson" JSONB,
    "wordCount" INTEGER NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "document_versions_chapterId_version_key" ON "document_versions"("chapterId", "version");
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
