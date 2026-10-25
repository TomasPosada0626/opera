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

export interface BillOfMaterialsItem {
  id: string;
  componentId: string;
  // Decimal como string — cuánto de este material lleva UNA unidad.
  quantity: string;
  component: {
    id: string;
    sku: string;
    name: string;
    type: 'RAW_MATERIAL' | 'SUPPLY' | 'FINISHED_GOOD';
    unit: { id: string; name: string; abbreviation: string };
  };
}

// id null = el producto todavía no tiene lista (items vacío).
export interface BillOfMaterials {
  id: string | null;
  productId: string;
  isActive: boolean;
  items: BillOfMaterialsItem[];
}
