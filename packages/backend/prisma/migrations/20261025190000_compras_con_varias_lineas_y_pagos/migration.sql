-- Compras con varias líneas, recepción parcial y pagos al proveedor
-- (ADR 0010). Reemplaza a SupplierPurchase (un producto por registro, sin
-- pagos): primero se crean las tablas nuevas, después se pasan los datos y
-- recién al final se borra la tabla vieja.

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('PENDIENTE', 'PARCIAL', 'RECIBIDA', 'CERRADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "supplierId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'PENDIENTE',
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" DATE,
    "supplierInvoice" TEXT,
    "notes" TEXT,
    "total" DECIMAL(16,4) NOT NULL,
    "amountPaid" DECIMAL(16,4) NOT NULL DEFAULT 0,
    "tracksPayment" BOOLEAN NOT NULL DEFAULT true,
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "quantityReceived" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Datos: cada SupplierPurchase pasa a ser una compra de una sola línea.
--
-- * tracksPayment = false en todas: la bitácora anterior nunca llevó pagos,
--   así que contarlas como deuda inventaría plata que nadie debe.
-- * Recibida (receivedAt) -> RECIBIDA, con su recepción atada a la ENTRADA
--   que ya existía en el Kardex.
-- * Sin bodega (registros de antes de que existiera la recepción, cuyo
--   stock se cargó a mano por Inventario) -> RECIBIDA sin recepción: no se
--   pueden recibir de nuevo, y recibirlas duplicaría ese stock. Quedan en
--   la bodega más antigua, solo como dato histórico.
-- * Con bodega y sin recibir -> PENDIENTE, se puede recibir como cualquier
--   compra nueva.
-- * El consecutivo sigue el orden en que se compraron.
-- ---------------------------------------------------------------------------

-- Una bodega para los registros históricos sin bodega, solo si hace falta
-- y no existe ninguna (no debería pasar: la configuración inicial ya crea
-- la Bodega principal).
INSERT INTO "Warehouse" ("id", "name", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'Bodega principal', true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Warehouse")
  AND EXISTS (SELECT 1 FROM "SupplierPurchase" WHERE "warehouseId" IS NULL);

INSERT INTO "PurchaseOrder" (
    "id", "supplierId", "warehouseId", "status", "purchasedAt", "total",
    "amountPaid", "tracksPayment", "userId", "createdAt", "updatedAt"
)
SELECT
    sp."id",
    sp."supplierId",
    COALESCE(
        sp."warehouseId",
        (SELECT w."id" FROM "Warehouse" w ORDER BY w."createdAt" ASC LIMIT 1)
    ),
    CASE
        WHEN sp."receivedAt" IS NOT NULL OR sp."warehouseId" IS NULL
            THEN 'RECIBIDA'::"PurchaseOrderStatus"
        ELSE 'PENDIENTE'::"PurchaseOrderStatus"
    END,
    sp."purchasedAt",
    sp."quantity" * sp."unitCost",
    0,
    false,
    sp."userId",
    sp."createdAt",
    now()
FROM "SupplierPurchase" sp
ORDER BY sp."purchasedAt" ASC, sp."createdAt" ASC;

INSERT INTO "PurchaseOrderItem" (
    "id", "purchaseOrderId", "productId", "quantity", "unitCost",
    "quantityReceived"
)
SELECT
    gen_random_uuid()::text,
    sp."id",
    sp."productId",
    sp."quantity",
    sp."unitCost",
    CASE
        WHEN sp."receivedAt" IS NOT NULL OR sp."warehouseId" IS NULL
            THEN sp."quantity"
        ELSE 0
    END
FROM "SupplierPurchase" sp;

INSERT INTO "PurchaseReceipt" (
    "id", "purchaseOrderItemId", "quantity", "stockMovementId", "receivedAt",
    "userId"
)
SELECT
    gen_random_uuid()::text,
    item."id",
    sp."quantity",
    sp."stockMovementId",
    sp."receivedAt",
    sp."userId"
FROM "SupplierPurchase" sp
JOIN "PurchaseOrderItem" item ON item."purchaseOrderId" = sp."id"
WHERE sp."receivedAt" IS NOT NULL
  AND sp."stockMovementId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "SupplierPurchase" DROP CONSTRAINT "SupplierPurchase_productId_fkey";

-- DropForeignKey
ALTER TABLE "SupplierPurchase" DROP CONSTRAINT "SupplierPurchase_stockMovementId_fkey";

-- DropForeignKey
ALTER TABLE "SupplierPurchase" DROP CONSTRAINT "SupplierPurchase_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "SupplierPurchase" DROP CONSTRAINT "SupplierPurchase_userId_fkey";

-- DropForeignKey
ALTER TABLE "SupplierPurchase" DROP CONSTRAINT "SupplierPurchase_warehouseId_fkey";

-- DropTable
DROP TABLE "SupplierPurchase";

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_purchasedAt_idx" ON "PurchaseOrder"("purchasedAt");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_productId_idx" ON "PurchaseOrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_stockMovementId_key" ON "PurchaseReceipt"("stockMovementId");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_purchaseOrderItemId_idx" ON "PurchaseReceipt"("purchaseOrderItemId");

-- CreateIndex
CREATE INDEX "SupplierPayment_purchaseOrderId_idx" ON "SupplierPayment"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "SupplierPayment_paidAt_idx" ON "SupplierPayment"("paidAt");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
