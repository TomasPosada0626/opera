import type {
  Order,
  OrderStatus,
  PaymentMethod,
  RemissionPaymentStatus,
} from '../types/order';
import type { BadgeVariant } from '../components/ui/Badge';
import { parseDateOnly } from './format';

// Etiquetas y colores de los estados, compartidos por todas las pantallas
// de pedidos — antes cada página tenía su copia y ninguna conocía
// DESPACHADO.
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_PRODUCCION: 'En producción',
  EN_ALMACEN: 'En almacén',
  DESPACHADO: 'Despachado',
  CANCELADO: 'Cancelado',
};

export const ORDER_STATUS_VARIANT: Record<OrderStatus, BadgeVariant> = {
  PENDIENTE: 'neutral',
  EN_PRODUCCION: 'accent',
  EN_ALMACEN: 'warning',
  DESPACHADO: 'success',
  CANCELADO: 'danger',
};

export const PAYMENT_STATUS_LABEL: Record<RemissionPaymentStatus, string> = {
  PAGADO: 'Pagado',
  ABONADO: 'Abonado',
  CARTERA: 'En cartera',
};

export const PAYMENT_STATUS_VARIANT: Record<
  RemissionPaymentStatus,
  BadgeVariant
> = {
  PAGADO: 'success',
  ABONADO: 'warning',
  CARTERA: 'danger',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA: 'Tarjeta',
  CHEQUE: 'Cheque',
  OTRO: 'Otro',
};

export interface OrderStation {
  status: Exclude<OrderStatus, 'CANCELADO'>;
  label: string;
  enteredAt: string | null;
  // Cuándo salió de esta estación (la marca de la siguiente), null si es
  // la actual o todavía no llegó.
  leftAt: string | null;
}

// Las cuatro estaciones del pedido con la marca de entrada de cada una:
// createdAt -> productionStartedAt -> warehousedAt -> dispatchedAt. El
// tiempo en cada estación es la diferencia entre marcas consecutivas.
export function orderStations(order: Order): OrderStation[] {
  const marks: [OrderStation['status'], string | null][] = [
    ['PENDIENTE', order.createdAt],
    ['EN_PRODUCCION', order.productionStartedAt],
    ['EN_ALMACEN', order.warehousedAt],
    ['DESPACHADO', order.dispatchedAt],
  ];
  return marks.map(([status, enteredAt], index) => ({
    status,
    label: ORDER_STATUS_LABEL[status],
    enteredAt,
    leftAt: marks[index + 1]?.[1] ?? null,
  }));
}

// Cuándo entró el pedido a su estado actual — para "lleva N días acá".
export function currentStationSince(order: Order): string {
  switch (order.status) {
    case 'EN_PRODUCCION':
      return order.productionStartedAt ?? order.createdAt;
    case 'EN_ALMACEN':
      return order.warehousedAt ?? order.createdAt;
    case 'DESPACHADO':
      return order.dispatchedAt ?? order.createdAt;
    case 'CANCELADO':
      return order.cancelledAt ?? order.createdAt;
    default:
      return order.createdAt;
  }
}

export function isOrderOpen(status: OrderStatus): boolean {
  return status !== 'DESPACHADO' && status !== 'CANCELADO';
}

export type DeliveryState =
  | { kind: 'none' }
  | { kind: 'done' }
  | { kind: 'overdue'; days: number }
  | { kind: 'today' }
  | { kind: 'upcoming'; days: number };

// Misma regla que overdueWhere() del backend: atrasado = la fecha
// prometida es anterior a hoy y el pedido sigue abierto.
export function deliveryState(
  order: Pick<Order, 'estimatedDeliveryDate' | 'status'>,
  now: Date = new Date(),
): DeliveryState {
  if (!order.estimatedDeliveryDate) {
    return { kind: 'none' };
  }
  if (!isOrderOpen(order.status)) {
    return { kind: 'done' };
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = parseDateOnly(order.estimatedDeliveryDate);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) {
    return { kind: 'overdue', days: -days };
  }
  if (days === 0) {
    return { kind: 'today' };
  }
  return { kind: 'upcoming', days };
}

export function orderTotal(order: Pick<Order, 'items'>): number {
  return order.items.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
    0,
  );
}

// Excluye remisiones anuladas (#99) — su ENTRADA de reverso ya corrigió el
// stock, así que esa cantidad deja de contar como entregada.
export function deliveredFor(order: Order, orderItemId: string): number {
  return order.remissions
    .filter((remission) => !remission.voidedAt)
    .reduce(
      (sum, remission) =>
        sum +
        remission.items
          .filter((item) => item.orderItemId === orderItemId)
          .reduce((lineSum, item) => lineSum + Number(item.quantity), 0),
      0,
    );
}

// Cobro del pedido completo: lo despachado (remisiones vigentes) y lo
// abonado, para el resumen del detalle.
export function orderCollection(order: Order): {
  dispatched: number;
  paid: number;
  pending: number;
} {
  const active = order.remissions.filter((remission) => !remission.voidedAt);
  const dispatched = active.reduce((sum, r) => sum + Number(r.total), 0);
  const paid = active.reduce((sum, r) => sum + Number(r.amountPaid), 0);
  return { dispatched, paid, pending: dispatched - paid };
}
