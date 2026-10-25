-- Seguimiento de pedidos (número consecutivo, fecha de envío estimada,
-- notas, marcas de despacho/cancelación) e historial de abonos por remisión
-- (auditoría ronda 6). El valor nuevo DESPACHADO del enum se agrega acá,
-- pero los datos que lo usan van en la migración siguiente: Postgres no
-- deja usar un valor de enum en la misma transacción que lo crea.

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CHEQUE', 'OTRO');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'DESPACHADO';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "dispatchedAt" TIMESTAMP(3),
ADD COLUMN     "estimatedDeliveryDate" DATE,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "number" SERIAL NOT NULL;

-- SERIAL numera en el orden físico de las filas, no por fecha: se
-- renumera por createdAt para que "Pedido No. 1" sea de verdad el primero,
-- y la secuencia sigue desde el último. Antes del índice único, para que
-- el renumerado no choque consigo mismo a mitad del UPDATE.
UPDATE "Order" o
SET "number" = s.rn
FROM (
  SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS rn
  FROM "Order"
) s
WHERE o.id = s.id;

SELECT setval(
  pg_get_serial_sequence('"Order"', 'number'),
  COALESCE((SELECT MAX("number") FROM "Order"), 0) + 1,
  false
);

-- Mejor aproximación disponible para pedidos cancelados antes de que
-- existiera la marca: la última modificación de la fila fue la cancelación.
UPDATE "Order" SET "cancelledAt" = "updatedAt" WHERE status = 'CANCELADO';

-- AlterTable: total de la remisión, fijado una sola vez.
ALTER TABLE "Remission" ADD COLUMN "total" DECIMAL(14,4) NOT NULL DEFAULT 0;

UPDATE "Remission" r
SET "total" = s.total
FROM (
  SELECT ri."remissionId", SUM(ri.quantity * oi."unitPrice") AS total
  FROM "RemissionItem" ri
  JOIN "OrderItem" oi ON oi.id = ri."orderItemId"
  GROUP BY ri."remissionId"
) s
WHERE r.id = s."remissionId";

ALTER TABLE "Remission" ALTER COLUMN "total" DROP DEFAULT;

-- amountPaid pasa a ser el resumen de los abonos. Se normaliza con la
-- misma regla que usaba CustomersService.getBalance(): PAGADO contaba el
-- total completo, ABONADO lo que dijera amountPaid, CARTERA nada.
UPDATE "Remission" SET "amountPaid" = "total" WHERE "paymentStatus" = 'PAGADO';
UPDATE "Remission" SET "amountPaid" = 0
WHERE "paymentStatus" = 'CARTERA' OR "amountPaid" IS NULL;
UPDATE "Remission" SET "amountPaid" = LEAST("amountPaid", "total")
WHERE "paymentStatus" = 'ABONADO';
UPDATE "Remission"
SET "paymentStatus" = (
  CASE
    WHEN "amountPaid" >= "total" THEN 'PAGADO'
    WHEN "amountPaid" > 0 THEN 'ABONADO'
    ELSE 'CARTERA'
  END
)::"RemissionPaymentStatus";

ALTER TABLE "Remission" ALTER COLUMN "amountPaid" SET NOT NULL,
ALTER COLUMN "amountPaid" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "RemissionPayment" (
    "id" TEXT NOT NULL,
    "remissionId" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemissionPayment_pkey" PRIMARY KEY ("id")
);

-- Lo ya cobrado antes de este cambio queda como un primer abono, para que
-- amountPaid siga siendo igual a la suma de sus abonos. No se sabe la
-- fecha real ni el medio de pago: se usa la fecha de la remisión y OTRO.
INSERT INTO "RemissionPayment" ("id", "remissionId", "amount", "method", "paidAt", "note", "userId")
SELECT gen_random_uuid()::text, r.id, r."amountPaid", 'OTRO', r."createdAt",
       'Registrado antes del historial de abonos', r."userId"
FROM "Remission" r
WHERE r."amountPaid" > 0;

-- CreateIndex
CREATE INDEX "RemissionPayment_remissionId_idx" ON "RemissionPayment"("remissionId");

-- CreateIndex
CREATE INDEX "RemissionPayment_paidAt_idx" ON "RemissionPayment"("paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE INDEX "Order_estimatedDeliveryDate_idx" ON "Order"("estimatedDeliveryDate");

-- AddForeignKey
ALTER TABLE "RemissionPayment" ADD CONSTRAINT "RemissionPayment_remissionId_fkey" FOREIGN KEY ("remissionId") REFERENCES "Remission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemissionPayment" ADD CONSTRAINT "RemissionPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
