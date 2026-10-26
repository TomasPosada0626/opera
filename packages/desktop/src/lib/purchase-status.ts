import type { BadgeVariant } from '../components/ui/Badge';
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  SupplierPaymentStatus,
} from '../types/purchase-order';

export const PURCHASE_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  PENDIENTE: 'Por recibir',
  PARCIAL: 'Llegó una parte',
  RECIBIDA: 'Recibida',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

export const PURCHASE_STATUS_VARIANT: Record<
  PurchaseOrderStatus,
  BadgeVariant
> = {
  PENDIENTE: 'neutral',
  PARCIAL: 'warning',
  RECIBIDA: 'success',
  CERRADA: 'accent',
  CANCELADA: 'danger',
};

export const SUPPLIER_PAYMENT_LABEL: Record<SupplierPaymentStatus, string> = {
  PENDIENTE: 'Sin pagar',
  ABONADA: 'Abonada',
  PAGADA: 'Pagada',
  NO_APLICA: 'Histórica',
};

export const SUPPLIER_PAYMENT_VARIANT: Record<
  SupplierPaymentStatus,
  BadgeVariant
> = {
  PENDIENTE: 'danger',
  ABONADA: 'warning',
  PAGADA: 'success',
  NO_APLICA: 'neutral',
};

// Todavía se puede recibir mercancía.
export function isPurchaseOpen(status: PurchaseOrderStatus): boolean {
  return status === 'PENDIENTE' || status === 'PARCIAL';
}

export function pendingQuantity(item: PurchaseOrderItem): number {
  return Math.max(0, Number(item.quantity) - Number(item.quantityReceived));
}

// Qué parte del valor de la compra ya llegó (0 a 1), para la barra de la
// lista.
export function receivedRatio(
  order: Pick<PurchaseOrder, 'total' | 'receivedValue'>,
): number {
  const total = Number(order.total);
  return total > 0 ? Math.min(1, Number(order.receivedValue) / total) : 0;
}
