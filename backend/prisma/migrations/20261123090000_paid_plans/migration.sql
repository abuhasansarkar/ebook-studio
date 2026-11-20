-- S12: paid plans, subscriptions, payments, entitlements and a webhook inbox.
--
-- The rule this schema exists to enforce is that only a *verified* payment
-- state grants access to a paid capability. Nothing in the browser can write
-- to these tables: the credit grant and the entitlement both hang off a
-- PaymentEvent, which is only created after a webhook signature has been
-- verified.
--
-- The payment_events table is the inbox. Every received event is written
-- there before it is applied, so a repeat delivery is a no-op (providerEventId
-- is unique) and a failed event is visible rather than lost.

CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "credits" INTEGER NOT NULL DEFAULT 0,
    "entitlements" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "providerPriceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "providerSubscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "providerPaymentId" TEXT NOT NULL,
    "providerCheckoutId" TEXT NOT NULL,
    "providerCustomerReference" TEXT NOT NULL DEFAULT '',
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "credits" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "settledEventAt" TIMESTAMP(3),
    "refundedEventAt" TIMESTAMP(3),
    "refundedCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'received',
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "entitlements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'subscription',
    "sourceId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriptions_providerSubscriptionId_key" ON "subscriptions" ("providerSubscriptionId");
CREATE INDEX "subscriptions_userId_status_idx" ON "subscriptions" ("userId", "status");
CREATE UNIQUE INDEX "payments_providerPaymentId_key" ON "payments" ("providerPaymentId");
CREATE UNIQUE INDEX "payments_providerCheckoutId_key" ON "payments" ("providerCheckoutId");
CREATE INDEX "payments_userId_createdAt_idx" ON "payments" ("userId", "createdAt");
CREATE INDEX "payments_status_idx" ON "payments" ("status");
CREATE UNIQUE INDEX "payment_events_providerEventId_key" ON "payment_events" ("providerEventId");
CREATE INDEX "payment_events_provider_createdAt_idx" ON "payment_events" ("provider", "createdAt");
CREATE INDEX "payment_events_status_idx" ON "payment_events" ("status");
CREATE UNIQUE INDEX "entitlements_userId_key_key" ON "entitlements" ("userId", "key");
CREATE INDEX "entitlements_userId_idx" ON "entitlements" ("userId");

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plans"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plans"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "entitlements"
  ADD CONSTRAINT "entitlements_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON UPDATE CASCADE ON DELETE CASCADE;
