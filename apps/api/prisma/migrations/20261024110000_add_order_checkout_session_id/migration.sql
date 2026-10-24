-- AlterTable
ALTER TABLE "Order" ADD COLUMN "checkoutSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_checkoutSessionId_key" ON "Order"("checkoutSessionId");

-- AlterTable
ALTER TABLE "InventoryReservation" ADD COLUMN "checkoutReservationGroupId" TEXT;

-- CreateIndex
CREATE INDEX "InventoryReservation_checkoutReservationGroupId_idx"
ON "InventoryReservation"("checkoutReservationGroupId");
