-- Export worker leases (additive). A processing export whose lease lapsed was
-- interrupted (worker crash, lost delivery) and is reconciled as failed instead
-- of blocking every later export of the book.
ALTER TABLE "exports" ADD COLUMN "leaseToken" TEXT;
ALTER TABLE "exports" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "exports" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "exports" ADD COLUMN "startedAt" TIMESTAMP(3);
