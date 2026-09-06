/*
  Warnings:

  - Added the required column `commissionAmount` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `commissionRate` to the `OrderItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "InventoryReservation" ADD COLUMN     "checkoutSessionId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "commissionAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "commissionRate" DECIMAL(5,4) NOT NULL;

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookEvent_type_idx" ON "WebhookEvent"("type");

-- CreateIndex
CREATE INDEX "InventoryReservation_checkoutSessionId_idx" ON "InventoryReservation"("checkoutSessionId");
