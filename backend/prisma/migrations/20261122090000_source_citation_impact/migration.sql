-- S11 follow-up: citation impact.
--
-- A citation links a chapter to the source passages that support it. Two things
-- were missing for a quality report to cross-reference those citations:
--
--   1. A deleted source removed its links, so nothing recorded that a chapter
--      once rested on text that is gone. The source is now soft-deleted: the
--      row is kept with deletedAt set, the stored file is removed, and the
--      links stay so the affected citations can be reported.
--   2. A link recorded only the locators, not the text it pointed at. It now
--      records the source version that was current when the link was made and
--      a digest of the cited passages, so a re-imported source or revised text
--      can be detected instead of silently changing what a citation means.

ALTER TABLE "research_sources" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "research_sources_bookId_deletedAt_idx" ON "research_sources" ("bookId", "deletedAt");

ALTER TABLE "chapter_source_links" ADD COLUMN "sourceVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "chapter_source_links" ADD COLUMN "passageDigest" TEXT NOT NULL DEFAULT '';

-- Links that existed before this migration have no recorded digest. They are
-- assessed as unverifiable rather than as citations that still hold, so the
-- report does not claim a citation is current when it was never checked.
