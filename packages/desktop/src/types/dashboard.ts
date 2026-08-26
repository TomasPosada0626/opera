export interface DashboardSummary {
  inventory: {
    totalStockValue: string;
    lowStockCount: number;
    lowStockProducts: {
      id: string;
      sku: string;
      name: string;
      currentStock: string;
      minStock: string | null;
    }[];
  };
  production: {
    PENDIENTE: number;
    EN_PROCESO: number;
    COMPLETADA: number;
  };
  orders: {
    PENDIENTE: number;
    EN_PRODUCCION: number;
    EN_ALMACEN: number;
    CANCELADO: number;
  };
  recentPurchases: {
    id: string;
    supplierName: string;
    productName: string;
    quantity: string;
    unitCost: string;
    purchasedAt: string;
  }[];
  recentSales: {
    id: string;
    customerName: string;
    status: 'PENDIENTE' | 'EN_PRODUCCION' | 'EN_ALMACEN' | 'CANCELADO';
    total: string;
    createdAt: string;
  }[];
  recentActivity: {
    id: string;
    entity: string;
    entityId: string;
    action: string;
    userName: string;
    timestamp: string;
  }[];
}
