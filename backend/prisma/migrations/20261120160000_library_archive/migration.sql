ALTER TABLE "books" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "projects" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "books_owner_archive_created_idx" ON "books"("userId", "deletedAt", "archivedAt", "createdAt", "id");
CREATE INDEX "projects_owner_created_idx" ON "projects"("userId", "deletedAt", "createdAt", "id");
