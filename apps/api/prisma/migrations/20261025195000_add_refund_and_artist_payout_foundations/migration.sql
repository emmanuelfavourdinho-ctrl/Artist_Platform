ALTER TYPE "FinancialActivityType" ADD VALUE 'REFUND_CONFIRMED';
ALTER TYPE "FinancialActivityType" ADD VALUE 'ARTIST_PAYOUT_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'FINANCIAL_OPERATION_CHANGED';

CREATE TYPE "RefundStatus" AS ENUM (
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'SUBMITTED',
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'MANUAL_RECONCILIATION'
);
CREATE TYPE "ArtistPayoutStatus" AS ENUM (
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'SUBMITTED',
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'MANUAL_RECONCILIATION'
);
CREATE TYPE "FinancialOperationEventType" AS ENUM (
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'SUBMITTED',
  'PROVIDER_PENDING',
  'SUCCEEDED',
  'FAILED',
  'MANUAL_RECONCILIATION',
  'RETRY_AUTHORIZED'
);

ALTER TABLE "FinancialActivity"
  ALTER COLUMN "sourceEventId" DROP NOT NULL,
  ALTER COLUMN "checkoutSessionId" DROP NOT NULL,
  ADD COLUMN "refundId" TEXT,
  ADD COLUMN "payoutId" TEXT,
  ADD CONSTRAINT "FinancialActivity_single_operation_source"
    CHECK (num_nonnulls("refundId", "payoutId") <= 1);
CREATE INDEX "FinancialActivity_refundId_idx" ON "FinancialActivity"("refundId");
CREATE INDEX "FinancialActivity_payoutId_idx" ON "FinancialActivity"("payoutId");

CREATE TABLE "RefundRequest" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "decidedBy" TEXT,
  "amountMinorUnits" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
  "idempotencyKey" TEXT NOT NULL,
  "provider" TEXT,
  "providerReference" TEXT,
  "providerEventId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "nextRetryAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "decidedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefundRequest_amountMinorUnits_positive" CHECK ("amountMinorUnits" > 0)
);
CREATE UNIQUE INDEX "RefundRequest_idempotencyKey_key" ON "RefundRequest"("idempotencyKey");
CREATE INDEX "RefundRequest_paymentId_status_idx" ON "RefundRequest"("paymentId", "status");
CREATE INDEX "RefundRequest_orderId_createdAt_idx" ON "RefundRequest"("orderId", "createdAt");
CREATE INDEX "RefundRequest_status_updatedAt_idx" ON "RefundRequest"("status", "updatedAt");
CREATE INDEX "RefundRequest_provider_providerReference_idx"
  ON "RefundRequest"("provider", "providerReference");
ALTER TABLE "RefundRequest"
  ADD CONSTRAINT "RefundRequest_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RefundRequest_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RefundRequest_requestedBy_fkey"
    FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RefundRequest_decidedBy_fkey"
    FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ArtistPayout" (
  "id" TEXT NOT NULL,
  "fulfillmentId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "decidedBy" TEXT,
  "amountMinorUnits" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "commissionMinorUnits" BIGINT NOT NULL,
  "status" "ArtistPayoutStatus" NOT NULL DEFAULT 'REQUESTED',
  "idempotencyKey" TEXT NOT NULL,
  "provider" TEXT,
  "providerReference" TEXT,
  "providerEventId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "nextRetryAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "decidedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArtistPayout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ArtistPayout_amountMinorUnits_positive" CHECK ("amountMinorUnits" > 0),
  CONSTRAINT "ArtistPayout_commissionMinorUnits_nonnegative" CHECK ("commissionMinorUnits" >= 0)
);
CREATE UNIQUE INDEX "ArtistPayout_fulfillmentId_key" ON "ArtistPayout"("fulfillmentId");
CREATE UNIQUE INDEX "ArtistPayout_idempotencyKey_key" ON "ArtistPayout"("idempotencyKey");
CREATE INDEX "ArtistPayout_orderId_status_idx" ON "ArtistPayout"("orderId", "status");
CREATE INDEX "ArtistPayout_artistId_createdAt_idx" ON "ArtistPayout"("artistId", "createdAt");
CREATE INDEX "ArtistPayout_status_updatedAt_idx" ON "ArtistPayout"("status", "updatedAt");
CREATE INDEX "ArtistPayout_provider_providerReference_idx"
  ON "ArtistPayout"("provider", "providerReference");
ALTER TABLE "ArtistPayout"
  ADD CONSTRAINT "ArtistPayout_fulfillmentId_fkey"
    FOREIGN KEY ("fulfillmentId") REFERENCES "ArtistOrderFulfillment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ArtistPayout_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ArtistPayout_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "ArtistProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ArtistPayout_requestedBy_fkey"
    FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ArtistPayout_decidedBy_fkey"
    FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FinancialOperationEvent" (
  "id" TEXT NOT NULL,
  "refundRequestId" TEXT,
  "artistPayoutId" TEXT,
  "actorId" TEXT,
  "eventType" "FinancialOperationEventType" NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT,
  "providerReference" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialOperationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialOperationEvent_exactly_one_operation"
    CHECK (num_nonnulls("refundRequestId", "artistPayoutId") = 1)
);
CREATE INDEX "FinancialOperationEvent_refundRequestId_occurredAt_idx"
  ON "FinancialOperationEvent"("refundRequestId", "occurredAt");
CREATE INDEX "FinancialOperationEvent_artistPayoutId_occurredAt_idx"
  ON "FinancialOperationEvent"("artistPayoutId", "occurredAt");
CREATE INDEX "FinancialOperationEvent_actorId_occurredAt_idx"
  ON "FinancialOperationEvent"("actorId", "occurredAt");
ALTER TABLE "FinancialOperationEvent"
  ADD CONSTRAINT "FinancialOperationEvent_refundRequestId_fkey"
    FOREIGN KEY ("refundRequestId") REFERENCES "RefundRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancialOperationEvent_artistPayoutId_fkey"
    FOREIGN KEY ("artistPayoutId") REFERENCES "ArtistPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancialOperationEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinancialActivity"
  ADD CONSTRAINT "FinancialActivity_refundId_fkey"
    FOREIGN KEY ("refundId") REFERENCES "RefundRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancialActivity_payoutId_fkey"
    FOREIGN KEY ("payoutId") REFERENCES "ArtistPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
