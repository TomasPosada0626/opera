import type { Warehouse } from './inventory';

export type ProductionOrderStatus = 'PENDIENTE' | 'COMPLETADA' | 'CANCELADA';

// El backend incluye el Product completo pero sin category/unit anidados
// (orderInclude = { product: true, warehouse: true }, no un include
// recursivo) — solo se listan los campos que la vista realmente usa.
export interface ProductionOrderProduct {
  id: string;
  sku: string;
  name: string;
}

export interface ProductionOrder {
  id: string;
  product: ProductionOrderProduct;
  warehouse: Warehouse;
  quantity: string;
  status: ProductionOrderStatus;
  completedAt: string | null;
  totalCost: string | null;
  unitCost: string | null;
  createdAt: string;
}
