import type { Customer } from './customer';
import type { Warehouse } from './inventory';

export type OrderStatus = 'PENDIENTE' | 'CANCELADO';

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
}

export interface Order {
  id: string;
  status: OrderStatus;
  customer: Customer;
  warehouse: Warehouse;
  items: OrderItem[];
  remissions: Remission[];
  createdAt: string;
}
