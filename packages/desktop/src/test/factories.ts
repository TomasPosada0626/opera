import type { DashboardSummary } from '../types/dashboard';
import type { PaginatedResult } from '../types/product';
import type { Order, Remission, RemissionPayment } from '../types/order';
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  SupplierPayment,
} from '../types/purchase-order';

// Datos de prueba compartidos por los tests de pedidos/remisiones/dashboard
// — antes cada archivo armaba su propio Order completo a mano y cualquier
// campo nuevo del tipo obligaba a tocar todos.

export function fakeJwt(roles: string[]): string {
  const payload = {
    sub: 'user-1',
    email: 'admin@opera.local',
    roles,
    permissions: [],
  };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

export function buildPayment(
  overrides: Partial<RemissionPayment> = {},
): RemissionPayment {
  return {
    id: 'payment-1',
    amount: '25',
    method: 'EFECTIVO',
    paidAt: '2026-01-21T12:00:00.000Z',
    note: null,
    user: { id: 'user-1', name: 'Admin' },
    voidedAt: null,
    voidReason: null,
    createdAt: '2026-01-21T12:00:00.000Z',
    ...overrides,
  };
}

export function buildRemission(overrides: Partial<Remission> = {}): Remission {
  return {
    id: 'remission-1',
    number: 7,
    createdAt: '2026-01-20T10:00:00.000Z',
    user: { id: 'user-1', name: 'Admin' },
    items: [{ id: 'remission-item-1', orderItemId: 'item-1', quantity: '2' }],
    total: '50',
    amountPaid: '0',
    paymentStatus: 'CARTERA',
    payments: [],
    voidedAt: null,
    voidReason: null,
    ...overrides,
  };
}

export function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    number: 12,
    status: 'PENDIENTE',
    customer: {
      id: 'customer-1',
      name: 'Muebles del Valle S.A.S.',
      taxId: null,
      email: null,
      phone: null,
      address: null,
      isActive: true,
    },
    warehouse: {
      id: 'warehouse-1',
      name: 'Bodega principal',
      location: null,
      isActive: true,
    },
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        product: { id: 'product-1', sku: 'PT-1', name: 'Silla de madera' },
        quantity: '3',
        unitPrice: '25',
      },
    ],
    remissions: [],
    estimatedDeliveryDate: null,
    notes: null,
    createdAt: '2026-01-15T10:00:00.000Z',
    productionStartedAt: null,
    warehousedAt: null,
    dispatchedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

export function paginated<T>(data: T[]): PaginatedResult<T> {
  return {
    data,
    meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
  };
}

export function buildDashboardSummary(
  overrides: Partial<DashboardSummary> = {},
): DashboardSummary {
  return {
    inventory: {
      totalStockValue: '475',
      lowStockCount: 0,
      lowStockProducts: [],
    },
    production: { PENDIENTE: 0, COMPLETADA: 0, CANCELADA: 0 },
    orders: {
      PENDIENTE: 0,
      EN_PRODUCCION: 0,
      EN_ALMACEN: 0,
      DESPACHADO: 0,
      CANCELADO: 0,
    },
    overdueOrders: { count: 0, orders: [] },
    receivables: { total: '0', remissionCount: 0 },
    payables: { total: '0', purchaseOrderCount: 0 },
    recentPurchases: [],
    recentSales: [],
    recentActivity: [],
    recentWarnings: 0,
    ...overrides,
  };
}

export function buildPurchaseItem(
  overrides: Partial<PurchaseOrderItem> = {},
): PurchaseOrderItem {
  return {
    id: 'po-item-1',
    productId: 'product-1',
    quantity: '10',
    unitCost: '500',
    quantityReceived: '0',
    position: 0,
    product: {
      id: 'product-1',
      sku: 'MP-ACR-18',
      name: 'Lámina de acero',
      unit: { abbreviation: 'kg' },
    },
    receipts: [],
    ...overrides,
  };
}

export function buildSupplierPayment(
  overrides: Partial<SupplierPayment> = {},
): SupplierPayment {
  return {
    id: 'supplier-payment-1',
    amount: '1000',
    method: 'TRANSFERENCIA',
    paidAt: '2026-10-20T12:00:00.000Z',
    note: null,
    voidedAt: null,
    voidReason: null,
    user: { id: 'user-1', name: 'Admin' },
    ...overrides,
  };
}

export function buildPurchaseOrder(
  overrides: Partial<PurchaseOrder> = {},
): PurchaseOrder {
  return {
    id: 'po-1',
    number: 7,
    status: 'PENDIENTE',
    purchasedAt: '2026-10-18T12:00:00.000Z',
    expectedDate: null,
    supplierInvoice: null,
    notes: null,
    total: '5000',
    amountPaid: '0',
    tracksPayment: true,
    closedAt: null,
    cancelledAt: null,
    supplier: { id: 'supplier-1', name: 'Aceros de Colombia S.A.' },
    warehouse: { id: 'warehouse-1', name: 'Bodega principal' },
    user: { id: 'user-1', name: 'Admin' },
    items: [buildPurchaseItem()],
    payments: [],
    receivedValue: '0',
    payable: '0',
    paymentStatus: 'PENDIENTE',
    createdAt: '2026-10-18T12:00:00.000Z',
    ...overrides,
  };
}
