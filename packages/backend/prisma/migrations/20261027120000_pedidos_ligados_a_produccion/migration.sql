-- Pedidos y producción ligados (ADR 0012): "Enviar a producción" crea una
-- orden de producción por línea del pedido, al completarla se pide cuánto
-- salió bueno (lo único que entra al inventario) y, completadas todas, el
-- pedido pasa solo a almacén.

ALTER TABLE "ProductionOrder" ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "orderItemId" TEXT,
ADD COLUMN     "producedQuantity" DECIMAL(12,3);

CREATE UNIQUE INDEX "ProductionOrder_orderItemId_key" ON "ProductionOrder"("orderItemId");

CREATE INDEX "ProductionOrder_orderId_idx" ON "ProductionOrder"("orderId");

ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Las órdenes ya completadas produjeron exactamente lo planeado.
UPDATE "ProductionOrder" SET "producedQuantity" = "quantity"
WHERE "status" = 'COMPLETADA';

-- Los pedidos que ya estaban en producción reciben sus órdenes, para que
-- aparezcan en la pestaña Producción y se completen desde ahí como los
-- nuevos.
INSERT INTO "ProductionOrder" ("id", "productId", "warehouseId", "quantity", "status", "userId", "orderId", "orderItemId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), oi."productId", o."warehouseId", oi."quantity", 'PENDIENTE', o."userId", o."id", oi."id", COALESCE(o."productionStartedAt", now()), now()
FROM "Order" o
JOIN "OrderItem" oi ON oi."orderId" = o."id"
WHERE o."status" = 'EN_PRODUCCION';
