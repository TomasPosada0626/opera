-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordResetCodeHash" TEXT,
ADD COLUMN     "passwordResetExpiresAt" TIMESTAMP(3);
