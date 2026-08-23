-- CreateEnum
CREATE TYPE "RemissionPaymentStatus" AS ENUM ('PAGADO', 'ABONADO', 'CARTERA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'EN_PRODUCCION';
ALTER TYPE "OrderStatus" ADD VALUE 'EN_ALMACEN';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "productionStartedAt" TIMESTAMP(3),
ADD COLUMN     "warehousedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Remission" ADD COLUMN     "amountPaid" DECIMAL(14,4),
ADD COLUMN     "paymentStatus" "RemissionPaymentStatus" NOT NULL DEFAULT 'CARTERA';
