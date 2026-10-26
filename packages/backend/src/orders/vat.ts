import { Prisma } from '@prisma/client';

// Tarifas de IVA que maneja Opera: sin IVA o la general del 19 %. No todas
// las ventas de Herrajes Toro llevan IVA, así que se elige por pedido (ver
// Order.vatRate). Una tarifa nueva (el 5 %, por ejemplo) se agrega acá.
export const VAT_RATES = [0, 19] as const;

// IVA de un subtotal, redondeado al centavo como cualquier otro valor en
// pesos de Opera.
export function vatAmountFor(
  subtotal: Prisma.Decimal,
  rate: Prisma.Decimal.Value,
): Prisma.Decimal {
  return subtotal
    .times(rate)
    .dividedBy(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
