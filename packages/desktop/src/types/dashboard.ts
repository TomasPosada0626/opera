import type { OrderStatus } from './order';

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
    COMPLETADA: number;
    CANCELADA: number;
  };
  orders: Record<OrderStatus, number>;
  // Fecha de envío vencida y sin despachar (misma regla que ?overdue=true).
  overdueOrders: {
    count: number;
    orders: {
      id: string;
      number: number;
      customerName: string;
      status: OrderStatus;
      estimatedDeliveryDate: string;
    }[];
  };
  // Total - abonado de las remisiones vigentes que no están pagadas.
  receivables: {
    total: string;
    remissionCount: number;
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
    number: number;
    customerName: string;
    status: OrderStatus;
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
  recentWarnings: number;
}
