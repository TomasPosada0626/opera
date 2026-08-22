/*
  Warnings:

  - Added the required column `warehouseId` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "warehouseId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Order_warehouseId_idx" ON "Order"("warehouseId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
