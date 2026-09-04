ALTER TABLE "ArtworkImage"
  ADD COLUMN "publicId" TEXT,
  ADD COLUMN "secureUrl" TEXT,
  ADD COLUMN "resourceType" TEXT NOT NULL DEFAULT 'image',
  ADD COLUMN "format" TEXT,
  ADD COLUMN "bytes" INTEGER;

CREATE UNIQUE INDEX "ArtworkImage_publicId_key" ON "ArtworkImage"("publicId");
