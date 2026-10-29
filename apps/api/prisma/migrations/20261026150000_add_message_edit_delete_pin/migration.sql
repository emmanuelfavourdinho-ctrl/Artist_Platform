ALTER TABLE "Message"
  ADD COLUMN "editedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "pinnedAt" TIMESTAMP(3),
  ADD COLUMN "pinnedById" TEXT;

CREATE INDEX "Message_conversationId_pinnedAt_idx" ON "Message"("conversationId", "pinnedAt");

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_pinnedById_fkey"
  FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
