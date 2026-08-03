export interface Category {
  id: string;
  name: string;
}

export interface Unit {
  id: string;
  name: string;
  abbreviation: string;
}

export type ProductType = 'FINISHED_GOOD' | 'RAW_MATERIAL' | 'SUPPLY';

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
