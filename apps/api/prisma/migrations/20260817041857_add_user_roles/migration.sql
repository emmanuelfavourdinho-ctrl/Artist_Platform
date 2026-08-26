-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('BUYER', 'ARTIST', 'ADMIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'BUYER';
