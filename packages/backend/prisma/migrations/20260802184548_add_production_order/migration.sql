-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'COMPLETADA');

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'PENDIENTE',
    "userId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionOrder_productId_idx" ON "ProductionOrder"("productId");

-- CreateIndex
CREATE INDEX "ProductionOrder_warehouseId_idx" ON "ProductionOrder"("warehouseId");

-- CreateIndex
CREATE INDEX "ProductionOrder_status_idx" ON "ProductionOrder"("status");

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
