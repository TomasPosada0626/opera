export interface Category {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Unit {
  id: string;
  name: string;
  abbreviation: string;
  isActive: boolean;
}

export type ProductType = 'FINISHED_GOOD' | 'RAW_MATERIAL' | 'SUPPLY';

// Compartido por InventoryPage, ProductForm y ProductsPage — antes vivía
// duplicado como const local de InventoryPage.
export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  FINISHED_GOOD: 'Producto terminado',
  RAW_MATERIAL: 'Materia prima',
  SUPPLY: 'Insumo',
};

// Los campos Decimal de Prisma (minStock, maxStock) llegan como string en el
// JSON — nunca number, para no perder precisión en el redondeo del cliente.
export interface Product {
  id: string;
  sku: string;
  name: string;
  type: ProductType;
  category: Category;
  unit: Unit;
  minStock: string | null;
  maxStock: string | null;
  // Texto libre, sin catálogo fijo — distinguen variantes del mismo
  // producto base (ver schema.prisma).
  finish: string | null;
  material: string | null;
  size: string | null;
  isActive: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface StockSummary {
  productId: string;
  stock: string;
}
