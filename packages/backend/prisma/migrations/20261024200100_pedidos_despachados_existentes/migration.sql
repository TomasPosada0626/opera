-- Pedidos que ya estaban despachados por completo antes de que existiera
-- el estado DESPACHADO: lo remisionado (sin anuladas) cubre todas sus
-- líneas. Va en su propia migración porque el valor del enum se creó en la
-- anterior (ver su comentario). dispatchedAt = la última remisión activa.
WITH delivered AS (
  SELECT oi.id, oi."orderId", oi.quantity,
         COALESCE(SUM(ri.quantity) FILTER (WHERE r."voidedAt" IS NULL), 0) AS delivered
  FROM "OrderItem" oi
  LEFT JOIN "RemissionItem" ri ON ri."orderItemId" = oi.id
  LEFT JOIN "Remission" r ON r.id = ri."remissionId"
  GROUP BY oi.id
),
complete_orders AS (
  SELECT "orderId"
  FROM delivered
  GROUP BY "orderId"
  HAVING bool_and(delivered >= quantity)
),
last_remission AS (
  SELECT "orderId", MAX("createdAt") AS last_at
  FROM "Remission"
  WHERE "voidedAt" IS NULL
  GROUP BY "orderId"
)
UPDATE "Order" o
SET status = 'DESPACHADO', "dispatchedAt" = lr.last_at
FROM complete_orders c
JOIN last_remission lr ON lr."orderId" = c."orderId"
WHERE o.id = c."orderId" AND o.status = 'EN_ALMACEN';
