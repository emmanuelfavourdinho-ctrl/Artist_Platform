CREATE TYPE "CheckoutIntentStatus" AS ENUM (
  'READY',
  'CREATING',
  'UNKNOWN',
  'OPEN',
  'COMPLETED',
  'PAID',
  'FAILED',
  'EXPIRED',
  'RECONCILIATION_REQUIRED'
);

CREATE TABLE "CheckoutIntent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "cartFingerprint" TEXT NOT NULL,
  "reservationGroupId" TEXT NOT NULL,
  "providerRequest" JSONB NOT NULL,
  "status" "CheckoutIntentStatus" NOT NULL DEFAULT 'READY',
  "stripeSessionId" TEXT,
  "checkoutUrl" TEXT,
  "providerExpiresAt" TIMESTAMP(3),
  "creationLeaseUntil" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CheckoutIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CheckoutIntent_reservationGroupId_key" ON "CheckoutIntent"("reservationGroupId");
CREATE UNIQUE INDEX "CheckoutIntent_stripeSessionId_key" ON "CheckoutIntent"("stripeSessionId");
CREATE UNIQUE INDEX "CheckoutIntent_userId_idempotencyKey_key" ON "CheckoutIntent"("userId", "idempotencyKey");
CREATE INDEX "CheckoutIntent_status_updatedAt_idx" ON "CheckoutIntent"("status", "updatedAt");
CREATE INDEX "CheckoutIntent_creationLeaseUntil_idx" ON "CheckoutIntent"("creationLeaseUntil");
ALTER TABLE "CheckoutIntent" ADD CONSTRAINT "CheckoutIntent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryReservation" ADD COLUMN "checkoutIntentId" TEXT;
CREATE INDEX "InventoryReservation_checkoutIntentId_idx" ON "InventoryReservation"("checkoutIntentId");
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_checkoutIntentId_fkey"
  FOREIGN KEY ("checkoutIntentId") REFERENCES "CheckoutIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
