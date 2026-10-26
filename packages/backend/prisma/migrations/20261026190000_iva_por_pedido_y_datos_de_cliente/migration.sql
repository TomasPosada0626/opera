-- La remisión impresa de Herrajes Toro (su formato en papel) pide datos
-- del cliente que Opera no guardaba, y no todas sus ventas llevan IVA.

-- Ficha del cliente: ciudad, país, celular, zona, asesor y condiciones de
-- pago (texto libre, todos opcionales).
ALTER TABLE "Customer"
  ADD COLUMN "city" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "mobile" TEXT,
  ADD COLUMN "zone" TEXT,
  ADD COLUMN "salesRep" TEXT,
  ADD COLUMN "paymentTerms" TEXT;

-- IVA por pedido, en porcentaje. Los pedidos que ya existen quedan sin
-- IVA: así se crearon y así se remisionaron.
ALTER TABLE "Order" ADD COLUMN "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Cada remisión guarda su subtotal y su IVA; total = subtotal + IVA. Las
-- que ya existen no tenían IVA: su subtotal es su total.
ALTER TABLE "Remission"
  ADD COLUMN "subtotal" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "vatAmount" DECIMAL(14,4) NOT NULL DEFAULT 0;
UPDATE "Remission" SET "subtotal" = "total";
