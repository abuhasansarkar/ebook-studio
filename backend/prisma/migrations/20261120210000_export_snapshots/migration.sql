-- S10: immutable export snapshots and stored-file validation.
--
-- Each export row now carries the exact inputs it renders (format, options,
-- chapter versions, pinned assets and a content hash) and the result of
-- validating the file that was read back from storage. The sha256 and
-- contentType columns let the download route confirm it is serving the file
-- that was validated.

ALTER TABLE "exports"
  ADD COLUMN "snapshot" JSONB,
  ADD COLUMN "validation" JSONB,
  ADD COLUMN "sha256" TEXT,
  ADD COLUMN "contentType" TEXT;

-- The stored file is now identified by a hash, so a replaced artifact is detectable.
CREATE INDEX "exports_sha256_idx" ON "exports" ("sha256");
