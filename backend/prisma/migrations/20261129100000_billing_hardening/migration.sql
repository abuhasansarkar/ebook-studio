-- Billing hardening.
--
-- - payment_events gains a claim timestamp and an attempt counter, so a
--   webhook that failed (or whose worker crashed mid-way) is retried on the
--   next delivery instead of being reported as a duplicate forever.
-- - payments learn about subscription invoices, partial refunds and disputes.
-- - credit_reservations tracks every reservation until it is settled, so a
--   reservation leaked by a crashed request can be swept back to the wallet.
-- - credit_wallets may never go negative. A refund takes back at most what the
--   wallet holds and records the shortfall on the payment instead.

ALTER TABLE "payment_events"
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "payments"
    ADD COLUMN "refundedAmountMinor" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "refundShortfallCredits" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "providerSubscriptionId" TEXT,
    ADD COLUMN "providerInvoiceId" TEXT,
    ADD COLUMN "disputeStatus" TEXT,
    ADD COLUMN "disputedCredits" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "disputedEventAt" TIMESTAMP(3);

-- A payment refunded before this migration was refunded in full.
UPDATE "payments" SET "refundedAmountMinor" = "amountMinor" WHERE "status" = 'refunded';

CREATE UNIQUE INDEX "payments_providerInvoiceId_key" ON "payments"("providerInvoiceId");
CREATE INDEX "payments_providerCustomerReference_idx" ON "payments"("providerCustomerReference");
CREATE INDEX "payments_providerSubscriptionId_idx" ON "payments"("providerSubscriptionId");

CREATE TABLE "credit_reservations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'sync',
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_reservations_reference_key" ON "credit_reservations"("reference");
CREATE INDEX "credit_reservations_kind_settledAt_createdAt_idx" ON "credit_reservations"("kind", "settledAt", "createdAt");
CREATE INDEX "credit_reservations_userId_idx" ON "credit_reservations"("userId");

-- Reservations already open when this migration runs are tracked too, so the
-- sweeper can release the ones a crash left behind.
INSERT INTO "credit_reservations" ("id", "userId", "reference", "amount", "kind", "settledAt", "createdAt")
SELECT
    'res_' || r."id",
    r."userId",
    r."reference",
    -r."amount",
    CASE WHEN r."reference" LIKE 'job:%' THEN 'job' ELSE 'sync' END,
    s."createdAt",
    r."createdAt"
FROM "credit_transactions" r
LEFT JOIN "credit_transactions" s ON s."idempotencyKey" = 'settle:' || r."reference"
WHERE r."type" = 'reserve' AND r."reference" IS NOT NULL
ON CONFLICT ("reference") DO NOTHING;

-- NOT VALID: enforced for every new write without failing the migration on a
-- historic row; VALIDATE separately once any such row has been corrected.
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_balance_nonnegative" CHECK ("balance" >= 0) NOT VALID;
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_reserved_nonnegative" CHECK ("reserved" >= 0) NOT VALID;
