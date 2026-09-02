/*
  Warnings:

  - A unique constraint covering the columns `[userId,artworkId]` on the table `Review` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tokenHash]` on the table `Session` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `action` on the `AuditLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_ROLE_UPDATED', 'ARTIST_VERIFICATION_CHANGED', 'ORDER_STATUS_CHANGED', 'ARTWORK_MODERATED', 'SYSTEM_SETTING_CHANGED', 'REVIEW_APPROVED', 'REVIEW_REJECTED');

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "action",
ADD COLUMN     "action" "AuditAction" NOT NULL;

-- CreateIndex
CREATE INDEX "Artwork_visibility_idx" ON "Artwork"("visibility");

-- CreateIndex
CREATE INDEX "Artwork_status_visibility_publishedAt_idx" ON "Artwork"("status", "visibility", "publishedAt");

-- CreateIndex
CREATE INDEX "ArtworkCategory_categoryId_idx" ON "ArtworkCategory"("categoryId");

-- CreateIndex
CREATE INDEX "ArtworkImage_artworkId_isPrimary_idx" ON "ArtworkImage"("artworkId", "isPrimary");

-- CreateIndex
CREATE INDEX "ArtworkMedium_mediumId_idx" ON "ArtworkMedium"("mediumId");

-- CreateIndex
CREATE INDEX "ArtworkModeration_adminId_idx" ON "ArtworkModeration"("adminId");

-- CreateIndex
CREATE INDEX "ArtworkStyle_styleId_idx" ON "ArtworkStyle"("styleId");

-- CreateIndex
CREATE INDEX "ArtworkTheme_themeId_idx" ON "ArtworkTheme"("themeId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "CartItem_cartId_idx" ON "CartItem"("cartId");

-- CreateIndex
CREATE INDEX "InventoryReservation_expiresAt_idx" ON "InventoryReservation"("expiresAt");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "OrderItem_artistId_idx" ON "OrderItem"("artistId");

-- CreateIndex
CREATE INDEX "OrderItem_artworkId_idx" ON "OrderItem"("artworkId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Review_userId_idx" ON "Review"("userId");

-- CreateIndex
CREATE INDEX "Review_status_idx" ON "Review"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_artworkId_key" ON "Review"("userId", "artworkId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");
