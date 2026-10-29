-- Additive only. No existing row is changed or removed.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VERIFICATION_REQUEST_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VERIFICATION_RESPONSE_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VERIFICATION_REQUEST_CANCELLED';

CREATE TYPE "VerificationRequestStatus" AS ENUM ('AWAITING_ARTIST_INPUT', 'AWAITING_REVIEW', 'COMPLETED', 'CANCELLED');

CREATE TABLE "VerificationInfoRequest" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "status" "VerificationRequestStatus" NOT NULL DEFAULT 'AWAITING_ARTIST_INPUT',
    "message" TEXT,
    "fields" JSONB NOT NULL,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancellationReason" TEXT,

    CONSTRAINT "VerificationInfoRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationSubmission" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "submittedById" TEXT,
    "responses" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArtistVerificationDecision" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "decision" "VerificationStatus" NOT NULL,
    "reason" TEXT,
    "requestId" TEXT,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistVerificationDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VerificationInfoRequest_artistId_round_key" ON "VerificationInfoRequest"("artistId", "round");
CREATE INDEX "VerificationInfoRequest_artistId_status_idx" ON "VerificationInfoRequest"("artistId", "status");
CREATE INDEX "VerificationInfoRequest_status_createdAt_idx" ON "VerificationInfoRequest"("status", "createdAt");
CREATE UNIQUE INDEX "VerificationSubmission_requestId_key" ON "VerificationSubmission"("requestId");
CREATE INDEX "ArtistVerificationDecision_artistId_createdAt_idx" ON "ArtistVerificationDecision"("artistId", "createdAt");

ALTER TABLE "VerificationInfoRequest" ADD CONSTRAINT "VerificationInfoRequest_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "ArtistProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VerificationInfoRequest" ADD CONSTRAINT "VerificationInfoRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VerificationInfoRequest" ADD CONSTRAINT "VerificationInfoRequest_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VerificationSubmission" ADD CONSTRAINT "VerificationSubmission_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VerificationInfoRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VerificationSubmission" ADD CONSTRAINT "VerificationSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ArtistVerificationDecision" ADD CONSTRAINT "ArtistVerificationDecision_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "ArtistProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArtistVerificationDecision" ADD CONSTRAINT "ArtistVerificationDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VerificationInfoRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArtistVerificationDecision" ADD CONSTRAINT "ArtistVerificationDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
