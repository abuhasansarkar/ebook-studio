-- S11: research sources, immutable extractions and chapter-source links.
--
-- A source is a private document the author imported. Each upload produces an
-- immutable SourceVersion holding the extracted passages and their stable
-- locators, so a citation can point at the exact text it was derived from and a
-- later re-upload cannot change what an existing citation refers to.
--
-- The original uploaded file is kept privately (storageKey) and never served
-- without an ownership check.

CREATE TABLE "research_sources" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "provenance" TEXT NOT NULL DEFAULT '',
    "license" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "storageKey" TEXT,
    "sha256" TEXT,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_versions" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "passageCount" INTEGER NOT NULL DEFAULT 0,
    "characterCount" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "passages" JSONB NOT NULL DEFAULT '[]',
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chapter_source_links" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "locators" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapter_source_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "research_sources_bookId_createdAt_idx" ON "research_sources" ("bookId", "createdAt");
CREATE INDEX "research_sources_userId_createdAt_idx" ON "research_sources" ("userId", "createdAt");
CREATE UNIQUE INDEX "source_versions_sourceId_version_key" ON "source_versions" ("sourceId", "version");
CREATE UNIQUE INDEX "chapter_source_links_sourceId_chapterId_key" ON "chapter_source_links" ("sourceId", "chapterId");
CREATE INDEX "chapter_source_links_chapterId_idx" ON "chapter_source_links" ("chapterId");

ALTER TABLE "research_sources"
  ADD CONSTRAINT "research_sources_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "research_sources"
  ADD CONSTRAINT "research_sources_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "books"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "source_versions"
  ADD CONSTRAINT "source_versions_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "research_sources"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "chapter_source_links"
  ADD CONSTRAINT "chapter_source_links_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "research_sources"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "chapter_source_links"
  ADD CONSTRAINT "chapter_source_links_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "books"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "chapter_source_links"
  ADD CONSTRAINT "chapter_source_links_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON UPDATE CASCADE ON DELETE CASCADE;
