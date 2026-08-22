export interface InventoryReportRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  stock: string;
  averageCost: string;
  stockValue: string;
}

export interface SalesReport {
  from: string | null;
  to: string | null;
  orderCount: number;
  totalQuantity: string;
  totalRevenue: string;
}

export interface TopProductRow {
  productId: string;
  sku: string;
  name: string;
  quantitySold: string;
  revenue: string;
}
