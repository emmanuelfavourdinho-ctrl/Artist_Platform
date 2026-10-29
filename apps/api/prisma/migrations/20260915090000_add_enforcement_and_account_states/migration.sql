-- Additive only: no existing row is modified or removed.
--
-- ADD VALUE IF NOT EXISTS keeps this safe to apply on a database that
-- already received any of these values from another branch.

-- New account states.
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'RESTRICTED';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'BANNED';

-- New audit actions.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_WARNED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REPORT_REVIEWED';

-- Audit log: first-class reason and request correlation id.
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "reason" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "requestId" TEXT;

-- Enforcement history.
CREATE TYPE "EnforcementAction" AS ENUM ('WARNING', 'RESTRICTION', 'SUSPENSION', 'BAN', 'REINSTATEMENT');

CREATE TABLE "UserEnforcement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "EnforcementAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "previousStatus" "UserStatus",
    "newStatus" "UserStatus",
    "expiresAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "reportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEnforcement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserEnforcement_userId_createdAt_idx" ON "UserEnforcement"("userId", "createdAt");
CREATE INDEX "UserEnforcement_userId_endedAt_idx" ON "UserEnforcement"("userId", "endedAt");
CREATE INDEX "UserEnforcement_expiresAt_idx" ON "UserEnforcement"("expiresAt");

ALTER TABLE "UserEnforcement" ADD CONSTRAINT "UserEnforcement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserEnforcement" ADD CONSTRAINT "UserEnforcement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Audit lookups by actor/entity/time are the common admin queries.
CREATE INDEX IF NOT EXISTS "AuditLog_requestId_idx" ON "AuditLog"("requestId");

-- Staff roles. Reference data (not activity): idempotent, never overwrites.
INSERT INTO "Role" ("id", "name", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'MODERATOR', 'Reviews users, artists, artwork and reports', NOW(), NOW()),
  (gen_random_uuid()::text, 'FINANCE_ADMIN', 'Views and manages financial records', NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;
