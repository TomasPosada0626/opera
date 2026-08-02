-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "totalCost" DECIMAL(14,4),
ADD COLUMN     "unitCost" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "unitCost" DECIMAL(14,4);
