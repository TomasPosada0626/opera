import { Prisma, PurchaseOrderStatus } from '@prisma/client';

type Decimal = Prisma.Decimal;
const { Decimal } = Prisma;

// Las reglas de plata de una compra, en un solo lugar: las usan el
// servicio de compras, el reporte de cuentas por pagar, el dashboard y el
// saldo de cada proveedor (ADR 0010).

export type SupplierPaymentStatus =
  | 'PENDIENTE'
  | 'ABONADA'
  | 'PAGADA'
  // Compra migrada de la bitácora anterior: su pago nunca se llevó.
  | 'NO_APLICA';

// Valor de lo que ya llegó: es lo que de verdad se le debe al proveedor
// (lo pedido y no recibido todavía no es deuda).
export function receivedValueOf(
  items: Array<{ quantityReceived: Decimal; unitCost: Decimal }>,
): Decimal {
  return items.reduce(
    (sum, item) => sum.plus(item.quantityReceived.times(item.unitCost)),
    new Decimal(0),
  );
}

// Estado de pago contra el total de la compra, igual que
// paymentStatusFor() de remisiones.
export function supplierPaymentStatusFor(order: {
  tracksPayment: boolean;
  total: Decimal;
  amountPaid: Decimal;
}): SupplierPaymentStatus {
  if (!order.tracksPayment) {
    return 'NO_APLICA';
  }
  if (
    order.total.greaterThan(0) &&
    order.amountPaid.greaterThanOrEqualTo(order.total)
  ) {
    return 'PAGADA';
  }
  return order.amountPaid.greaterThan(0) ? 'ABONADA' : 'PENDIENTE';
}

// Por pagar = lo recibido menos lo pagado, nunca negativo (un anticipo por
// encima de lo recibido no es deuda).
export function payableOf(order: {
  tracksPayment: boolean;
  status: PurchaseOrderStatus;
  amountPaid: Decimal;
  items: Array<{ quantityReceived: Decimal; unitCost: Decimal }>;
}): Decimal {
  if (!order.tracksPayment || order.status === 'CANCELADA') {
    return new Decimal(0);
  }
  const owed = receivedValueOf(order.items).minus(order.amountPaid);
  return owed.greaterThan(0) ? owed : new Decimal(0);
}
