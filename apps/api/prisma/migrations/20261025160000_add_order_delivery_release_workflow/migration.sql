CREATE TYPE "PaymentReleaseStatus" AS ENUM ('NOT_ELIGIBLE', 'ELIGIBLE', 'BLOCKED');
CREATE TYPE "DeliveryDisputeStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');
CREATE TYPE "OrderDeliveryEventType" AS ENUM (
  'SHIPPED',
  'TRACKING_UPDATED',
  'ARTIST_COMPLETION_CONFIRMED',
  'BUYER_RECEIPT_CONFIRMED',
  'DELIVERY_DISPUTE_OPENED',
  'DELIVERY_DISPUTE_RESOLVED',
  'RELEASE_ELIGIBLE',
  'RELEASE_BLOCKED',
  'RELEASE_UNBLOCKED',
  'ARTIST_RESPONSE_WINDOW_EXPIRED',
  'RELEASE_HOLD_CHANGED'
);

ALTER TABLE "Order"
  ADD COLUMN "buyerReceivedGoodAt" TIMESTAMP(3),
  ADD COLUMN "artistResponseDeadline" TIMESTAMP(3),
  ADD COLUMN "artistResponseWindowExpiredAt" TIMESTAMP(3),
  ADD COLUMN "releaseStatus" "PaymentReleaseStatus" NOT NULL DEFAULT 'NOT_ELIGIBLE',
  ADD COLUMN "releaseEligibleAt" TIMESTAMP(3),
  ADD COLUMN "releaseHoldAt" TIMESTAMP(3),
  ADD COLUMN "releaseHoldReason" TEXT;

CREATE TABLE "ArtistOrderFulfillment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "carrier" TEXT,
  "trackingReference" TEXT,
  "trackingUrl" TEXT,
  "evidenceReferences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "shippedAt" TIMESTAMP(3),
  "artistCompletionConfirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArtistOrderFulfillment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArtistOrderFulfillment_orderId_artistId_key"
  ON "ArtistOrderFulfillment"("orderId", "artistId");
CREATE INDEX "ArtistOrderFulfillment_artistId_updatedAt_idx"
  ON "ArtistOrderFulfillment"("artistId", "updatedAt");
CREATE INDEX "ArtistOrderFulfillment_orderId_idx"
  ON "ArtistOrderFulfillment"("orderId");
ALTER TABLE "ArtistOrderFulfillment"
  ADD CONSTRAINT "ArtistOrderFulfillment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArtistOrderFulfillment"
  ADD CONSTRAINT "ArtistOrderFulfillment_artistId_fkey"
  FOREIGN KEY ("artistId") REFERENCES "ArtistProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DeliveryDispute" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "status" "DeliveryDisputeStatus" NOT NULL DEFAULT 'OPEN',
  "reason" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "evidenceReferences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "resolutionNote" TEXT,
  "resolvedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryDispute_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeliveryDispute_orderId_status_idx"
  ON "DeliveryDispute"("orderId", "status");
CREATE INDEX "DeliveryDispute_buyerId_createdAt_idx"
  ON "DeliveryDispute"("buyerId", "createdAt");
ALTER TABLE "DeliveryDispute"
  ADD CONSTRAINT "DeliveryDispute_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryDispute"
  ADD CONSTRAINT "DeliveryDispute_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryDispute"
  ADD CONSTRAINT "DeliveryDispute_resolvedBy_fkey"
  FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OrderDeliveryEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "actorId" TEXT,
  "eventType" "OrderDeliveryEventType" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "OrderDeliveryEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderDeliveryEvent_orderId_occurredAt_idx"
  ON "OrderDeliveryEvent"("orderId", "occurredAt");
CREATE INDEX "OrderDeliveryEvent_actorId_occurredAt_idx"
  ON "OrderDeliveryEvent"("actorId", "occurredAt");
ALTER TABLE "OrderDeliveryEvent"
  ADD CONSTRAINT "OrderDeliveryEvent_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderDeliveryEvent"
  ADD CONSTRAINT "OrderDeliveryEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
