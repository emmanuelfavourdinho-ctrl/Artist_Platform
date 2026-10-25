CREATE TYPE "FinancialActivityType" AS ENUM (
  'CHECKOUT_PAYMENT_CONFIRMED'
);

CREATE TABLE "FinancialActivity" (
  "id" TEXT NOT NULL,
  "movementIdentifier" TEXT NOT NULL,
  "movementType" "FinancialActivityType" NOT NULL,
  "amountMinorUnits" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerObjectReference" TEXT NOT NULL,
  "orderId" TEXT,
  "paymentId" TEXT,
  "occurredAt" TIMESTAMP(3),
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceEventId" TEXT NOT NULL,
  "checkoutSessionId" TEXT NOT NULL,
  CONSTRAINT "FinancialActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialActivity_movementIdentifier_key"
  ON "FinancialActivity"("movementIdentifier");
CREATE UNIQUE INDEX "FinancialActivity_provider_type_objectRef_key"
  ON "FinancialActivity"("provider", "movementType", "providerObjectReference");
CREATE INDEX "FinancialActivity_recordedAt_id_idx"
  ON "FinancialActivity"("recordedAt", "id");
CREATE INDEX "FinancialActivity_occurredAt_idx"
  ON "FinancialActivity"("occurredAt");
CREATE INDEX "FinancialActivity_currency_recordedAt_idx"
  ON "FinancialActivity"("currency", "recordedAt");
CREATE INDEX "FinancialActivity_orderId_idx"
  ON "FinancialActivity"("orderId");
CREATE INDEX "FinancialActivity_paymentId_idx"
  ON "FinancialActivity"("paymentId");

ALTER TABLE "FinancialActivity"
  ADD CONSTRAINT "FinancialActivity_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialActivity"
  ADD CONSTRAINT "FinancialActivity_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
