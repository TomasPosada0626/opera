import type { Customer } from './customer';
import type { Warehouse } from './inventory';

export type OrderStatus =
  'PENDIENTE' | 'EN_PRODUCCION' | 'EN_ALMACEN' | 'DESPACHADO' | 'CANCELADO';

export type RemissionPaymentStatus = 'PAGADO' | 'ABONADO' | 'CARTERA';

export type PaymentMethod =
  'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'CHEQUE' | 'OTRO';

// Solo los campos escalares de Product — el pedido incluye `product: true`
// sin anidar category/unit, así que no reutiliza el tipo Product completo.
export interface OrderItemProduct {
  id: string;
  sku: string;
  name: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  product: OrderItemProduct;
  quantity: string;
  unitPrice: string;
}

export interface RemissionItem {
  id: string;
  orderItemId: string;
  quantity: string;
}

// Un abono real del cliente. Append-only: uno anulado sigue en la lista
// (con su motivo), solo deja de contar en amountPaid.
export interface RemissionPayment {
  id: string;
  amount: string;
  method: PaymentMethod;
  paidAt: string;
  note: string | null;
  user: { id: string; name: string };
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

export interface Remission {
  id: string;
  number: number;
  createdAt: string;
  user: { id: string; name: string };
  items: RemissionItem[];
  // total/amountPaid/paymentStatus los calcula el backend a partir de los
  // abonos — el cliente nunca los elige. total = subtotal + vatAmount (el
  // IVA del pedido al remisionar): lo que el cliente debe.
  subtotal: string;
  vatAmount: string;
  total: string;
  amountPaid: string;
  paymentStatus: RemissionPaymentStatus;
  payments: RemissionPayment[];
  voidedAt: string | null;
  voidReason: string | null;
}

// Forma completa de GET /remissions/:id — distinta de `Remission` (la que
// viaja anidada dentro de `Order`, sin cliente/bodega/producto propios
// porque ya los hereda del pedido que la contiene). Usada por la vista de
// impresión (#print), que se abre sola sin un `Order` alrededor.
export interface RemissionDetailItem {
  id: string;
  orderItemId: string;
  quantity: string;
  orderItem: {
    id: string;
    unitPrice: string;
    product: {
      id: string;
      sku: string;
      name: string;
      material: string | null;
      finish: string | null;
      unit: { name: string; abbreviation: string };
    };
  };
}

export interface RemissionDetail {
  id: string;
  number: number;
  createdAt: string;
  user: { id: string; name: string };
  items: RemissionDetailItem[];
  subtotal: string;
  vatAmount: string;
  total: string;
  amountPaid: string;
  paymentStatus: RemissionPaymentStatus;
  voidedAt: string | null;
  voidReason: string | null;
  order: {
    id: string;
    number: number;
    vatRate: string;
    estimatedDeliveryDate: string | null;
    customer: Customer;
    warehouse: { id: string; name: string };
  };
}

export interface Order {
  id: string;
  number: number;
  status: OrderStatus;
  customer: Customer;
  warehouse: Warehouse;
  items: OrderItem[];
  remissions: Remission[];
  // Las órdenes de producción del pedido (una por línea, ADR 0012); vacío
  // hasta que se envía a producción.
  productionOrders?: {
    id: string;
    orderItemId: string | null;
    status: 'PENDIENTE' | 'COMPLETADA' | 'CANCELADA';
    quantity: string;
    producedQuantity: string | null;
  }[];
  // "AAAA-MM-DDT00:00:00.000Z" — fecha sin hora, ver lib/format.ts
  // (parseDateOnly) antes de mostrarla.
  estimatedDeliveryDate: string | null;
  notes: string | null;
  // IVA del pedido en porcentaje: "0" (sin IVA) o "19".
  vatRate: string;
  createdAt: string;
  productionStartedAt: string | null;
  warehousedAt: string | null;
  dispatchedAt: string | null;
  cancelledAt: string | null;
}
