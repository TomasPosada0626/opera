import type { OrderStatus } from './order';
import type { ProductionOrderStatus } from './production';

export interface GlobalSearchResult {
  products: { id: string; sku: string; name: string }[];
  customers: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  remissions: { id: string; number: number; orderId: string }[];
  orders: {
    id: string;
    number: number;
    status: OrderStatus;
    customer: { id: string; name: string };
  }[];
  productionOrders: {
    id: string;
    status: ProductionOrderStatus;
    product: { id: string; sku: string; name: string };
  }[];
}
