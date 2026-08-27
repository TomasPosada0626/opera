-- AlterTable
ALTER TABLE "SupplierPurchase" ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "stockMovementId" TEXT,
ADD COLUMN     "warehouseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPurchase_stockMovementId_key" ON "SupplierPurchase"("stockMovementId");

-- AddForeignKey
ALTER TABLE "SupplierPurchase" ADD CONSTRAINT "SupplierPurchase_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPurchase" ADD CONSTRAINT "SupplierPurchase_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
