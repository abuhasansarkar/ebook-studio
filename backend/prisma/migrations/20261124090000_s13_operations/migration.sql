-- DropForeignKey
ALTER TABLE "asset_references" DROP CONSTRAINT "asset_references_assetId_fkey";

-- DropForeignKey
ALTER TABLE "asset_references" DROP CONSTRAINT "asset_references_bookId_fkey";

-- DropForeignKey
ALTER TABLE "assets" DROP CONSTRAINT "assets_userId_fkey";

-- DropIndex
DROP INDEX "exports_sha256_idx";

-- AlterTable
ALTER TABLE "research_sources" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "admin_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "grantedBy" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokeReason" TEXT,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_entries" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL DEFAULT 'ok',
    "details" JSONB NOT NULL DEFAULT '{}',
    "requestId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_incidents" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "summary" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_manifests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "databaseFile" TEXT NOT NULL,
    "assetsFile" TEXT,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "databaseSha256" TEXT NOT NULL,
    "assetsSha256" TEXT,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "keyId" TEXT,
    "counts" JSONB NOT NULL DEFAULT '{}',
    "restoredAt" TIMESTAMP(3),
    "restoredInto" TEXT,
    "restoreVerified" BOOLEAN NOT NULL DEFAULT false,
    "restoreNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "correlationId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'question',
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "response" TEXT,
    "respondedBy" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_deliveries" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "summary" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "incidentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_roles_role_idx" ON "admin_roles"("role");

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_userId_role_key" ON "admin_roles"("userId", "role");

-- CreateIndex
CREATE INDEX "admin_audit_entries_actorId_idx" ON "admin_audit_entries"("actorId");

-- CreateIndex
CREATE INDEX "admin_audit_entries_action_idx" ON "admin_audit_entries"("action");

-- CreateIndex
CREATE INDEX "admin_audit_entries_targetType_targetId_idx" ON "admin_audit_entries"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "admin_audit_entries_createdAt_idx" ON "admin_audit_entries"("createdAt");

-- CreateIndex
CREATE INDEX "operational_incidents_kind_idx" ON "operational_incidents"("kind");

-- CreateIndex
CREATE INDEX "operational_incidents_resolvedAt_idx" ON "operational_incidents"("resolvedAt");

-- CreateIndex
CREATE INDEX "operational_incidents_createdAt_idx" ON "operational_incidents"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "backup_manifests_name_key" ON "backup_manifests"("name");

-- CreateIndex
CREATE INDEX "support_requests_userId_idx" ON "support_requests"("userId");

-- CreateIndex
CREATE INDEX "support_requests_status_idx" ON "support_requests"("status");

-- CreateIndex
CREATE INDEX "support_requests_createdAt_idx" ON "support_requests"("createdAt");

-- CreateIndex
CREATE INDEX "alert_deliveries_kind_idx" ON "alert_deliveries"("kind");

-- CreateIndex
CREATE INDEX "alert_deliveries_status_idx" ON "alert_deliveries"("status");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_entries" ADD CONSTRAINT "admin_audit_entries_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
