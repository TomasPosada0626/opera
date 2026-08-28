-- DropIndex
DROP INDEX "StockMovement_productId_warehouseId_idx";

-- CreateIndex
CREATE INDEX "StockMovement_productId_warehouseId_createdAt_idx" ON "StockMovement"("productId", "warehouseId", "createdAt");
