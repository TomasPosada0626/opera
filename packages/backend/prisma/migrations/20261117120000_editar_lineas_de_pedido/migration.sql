-- Líneas de pedido editables (ADR 0013): una línea puede tener varias
-- órdenes de producción (la original y las de extras pedidos después), así
-- que orderItemId deja de ser único.

DROP INDEX "ProductionOrder_orderItemId_key";

CREATE INDEX "ProductionOrder_orderItemId_idx" ON "ProductionOrder"("orderItemId");

-- Orden de las líneas dentro del pedido. Las existentes nunca se habían
-- actualizado, así que su orden físico (ctid) es el de inserción: el que
-- se vio al crear el pedido.
ALTER TABLE "OrderItem" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

UPDATE "OrderItem" AS oi
SET "position" = ranked."pos"
FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "orderId" ORDER BY "createdAt", ctid) - 1)::INTEGER AS "pos"
  FROM "OrderItem"
) AS ranked
WHERE oi."id" = ranked."id";
