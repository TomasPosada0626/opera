import type { Customer } from './customer';
import type { Warehouse } from './inventory';

export type OrderStatus =
  'PENDIENTE' | 'EN_PRODUCCION' | 'EN_ALMACEN' | 'CANCELADO';

export type RemissionPaymentStatus = 'PAGADO' | 'ABONADO' | 'CARTERA';

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

export interface Remission {
  id: string;
  number: number;
  createdAt: string;
  user: { id: string; name: string };
  items: RemissionItem[];
  paymentStatus: RemissionPaymentStatus;
  amountPaid: string | null;
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
    product: { id: string; sku: string; name: string };
  };
}

export interface RemissionDetail {
  id: string;
  number: number;
  createdAt: string;
  user: { id: string; name: string };
  items: RemissionDetailItem[];
  paymentStatus: RemissionPaymentStatus;
  amountPaid: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  order: {
    id: string;
    customer: { id: string; name: string };
    warehouse: { id: string; name: string };
  };
}

export interface Order {
  id: string;
  status: OrderStatus;
  customer: Customer;
  warehouse: Warehouse;
  items: OrderItem[];
  remissions: Remission[];
  createdAt: string;
  productionStartedAt: string | null;
  warehousedAt: string | null;
}
