-- Additive marketplace foundation for commissions, community posts, and contextual messaging.
ALTER TABLE "CommissionRequest"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "style" TEXT,
  ADD COLUMN "dimensions" TEXT,
  ADD COLUMN "intendedUse" TEXT,
  ADD COLUMN "notes" TEXT;

ALTER TABLE "Conversation"
  ADD COLUMN "artworkId" TEXT,
  ADD COLUMN "orderId" TEXT;

ALTER TABLE "Message"
  ADD COLUMN "attachmentType" TEXT,
  ADD COLUMN "attachmentName" TEXT,
  ADD COLUMN "attachmentSize" INTEGER;

CREATE TABLE "CommunityPost" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "artworkId" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "imageUrl" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionReference" (
  "id" TEXT NOT NULL,
  "commissionId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "publicId" TEXT,
  "resourceType" TEXT NOT NULL DEFAULT 'image',
  "fileName" TEXT,
  "fileType" TEXT,
  "fileSize" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionProposal" (
  "id" TEXT NOT NULL,
  "commissionId" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "estimatedCompletion" TIMESTAMP(3),
  "revisions" INTEGER,
  "deliveryFormat" TEXT,
  "usageRights" TEXT,
  "notes" TEXT,
  "expiresAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommissionProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommissionProposal_commissionId_key" ON "CommissionProposal"("commissionId");
CREATE INDEX "CommunityPost_artistId_publishedAt_idx" ON "CommunityPost"("artistId", "publishedAt");
CREATE INDEX "CommunityPost_publishedAt_idx" ON "CommunityPost"("publishedAt");
CREATE INDEX "CommissionReference_commissionId_idx" ON "CommissionReference"("commissionId");
CREATE INDEX "CommissionProposal_artistId_idx" ON "CommissionProposal"("artistId");
CREATE INDEX "CommissionProposal_status_idx" ON "CommissionProposal"("status");
CREATE INDEX "Conversation_artworkId_idx" ON "Conversation"("artworkId");
CREATE INDEX "Conversation_orderId_idx" ON "Conversation"("orderId");

ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "ArtistProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionReference" ADD CONSTRAINT "CommissionReference_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "CommissionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionProposal" ADD CONSTRAINT "CommissionProposal_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "CommissionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionProposal" ADD CONSTRAINT "CommissionProposal_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "ArtistProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
