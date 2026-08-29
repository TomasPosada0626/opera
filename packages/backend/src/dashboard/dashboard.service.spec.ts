import { Prisma } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ReportsService } from '../reports/reports.service';
import { AuditService } from '../audit/audit.service';
import { countRecentWarnings } from './recent-warnings.util';

// countRecentWarnings() lee el archivo de log real en disco (ver su propio
// spec para el comportamiento de parseo) — mockeado acá para que este spec
// no dependa de si logs/opera-backend.log existe en la máquina de quien
// corre los tests.
jest.mock('./recent-warnings.util', () => ({
  countRecentWarnings: jest.fn(),
}));
const mockedCountRecentWarnings = countRecentWarnings as jest.Mock;

describe('DashboardService', () => {
  let prisma: {
    productionOrder: { groupBy: jest.Mock };
    order: { groupBy: jest.Mock; findMany: jest.Mock };
    supplierPurchase: { findMany: jest.Mock };
  };
  let inventory: { getLowStockProducts: jest.Mock };
  let reports: { getInventoryReport: jest.Mock };
  let audit: { getRecent: jest.Mock };
  let service: DashboardService;

  beforeEach(() => {
    prisma = {
      productionOrder: { groupBy: jest.fn() },
      order: { groupBy: jest.fn(), findMany: jest.fn() },
      supplierPurchase: { findMany: jest.fn() },
    };
    inventory = { getLowStockProducts: jest.fn() };
    reports = { getInventoryReport: jest.fn() };
    audit = { getRecent: jest.fn() };
    service = new DashboardService(
      prisma as unknown as PrismaService,
      inventory as unknown as InventoryService,
      reports as unknown as ReportsService,
      audit as unknown as AuditService,
    );

    prisma.productionOrder.groupBy.mockResolvedValue([]);
    prisma.order.groupBy.mockResolvedValue([]);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.supplierPurchase.findMany.mockResolvedValue([]);
    inventory.getLowStockProducts.mockResolvedValue([]);
    reports.getInventoryReport.mockResolvedValue([]);
    audit.getRecent.mockResolvedValue([]);
    mockedCountRecentWarnings.mockReset().mockReturnValue(0);
  });

  it('sums the inventory report rows into a single stock value', async () => {
    reports.getInventoryReport.mockResolvedValue([
      { id: 'p1', sku: 'SKU-1', stockValue: new Prisma.Decimal(80) },
      { id: 'p2', sku: 'SKU-2', stockValue: new Prisma.Decimal(20) },
    ]);

    const result = await service.getSummary();

    expect(result.inventory.totalStockValue.toString()).toBe('100');
  });

  it('reports the low-stock count and a trimmed shape per product', async () => {
    inventory.getLowStockProducts.mockResolvedValue([
      {
        id: 'p1',
        sku: 'SKU-1',
        name: 'Silla',
        currentStock: new Prisma.Decimal(2),
        minStock: new Prisma.Decimal(5),
        category: { name: 'Muebles' },
      },
    ]);

    const result = await service.getSummary();

    expect(result.inventory.lowStockCount).toBe(1);
    expect(result.inventory.lowStockProducts).toEqual([
      {
        id: 'p1',
        sku: 'SKU-1',
        name: 'Silla',
        currentStock: new Prisma.Decimal(2),
        minStock: new Prisma.Decimal(5),
      },
    ]);
  });

  it('fills every production status with 0 when Prisma only returns the ones with rows', async () => {
    prisma.productionOrder.groupBy.mockResolvedValue([
      { status: 'COMPLETADA', _count: 3 },
    ]);

    const result = await service.getSummary();

    expect(result.production).toEqual({
      PENDIENTE: 0,
      EN_PROCESO: 0,
      COMPLETADA: 3,
    });
  });

  it('fills every order status with 0 when Prisma only returns the ones with rows', async () => {
    prisma.order.groupBy.mockResolvedValue([
      { status: 'PENDIENTE', _count: 2 },
      { status: 'EN_ALMACEN', _count: 5 },
    ]);

    const result = await service.getSummary();

    expect(result.orders).toEqual({
      PENDIENTE: 2,
      EN_PRODUCCION: 0,
      EN_ALMACEN: 5,
      CANCELADO: 0,
    });
  });

  it('flattens recent purchases to supplier/product names', async () => {
    prisma.supplierPurchase.findMany.mockResolvedValue([
      {
        id: 'purchase-1',
        supplier: { id: 's1', name: 'Maderas del Sur' },
        product: { id: 'p1', sku: 'MP-1', name: 'Tabla de pino' },
        quantity: new Prisma.Decimal(10),
        unitCost: new Prisma.Decimal(5),
        purchasedAt: new Date('2026-08-01'),
      },
    ]);

    const result = await service.getSummary();

    expect(result.recentPurchases).toEqual([
      {
        id: 'purchase-1',
        supplierName: 'Maderas del Sur',
        productName: 'Tabla de pino',
        quantity: new Prisma.Decimal(10),
        unitCost: new Prisma.Decimal(5),
        purchasedAt: new Date('2026-08-01'),
      },
    ]);
  });

  it('computes each recent sale total from its order items', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-1',
        status: 'PENDIENTE',
        createdAt: new Date('2026-08-01'),
        customer: { id: 'c1', name: 'Muebles del Valle' },
        items: [
          {
            quantity: new Prisma.Decimal(2),
            unitPrice: new Prisma.Decimal(50),
          },
          {
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(30),
          },
        ],
      },
    ]);

    const result = await service.getSummary();

    expect(result.recentSales).toEqual([
      expect.objectContaining({
        id: 'order-1',
        customerName: 'Muebles del Valle',
        status: 'PENDIENTE',
        total: new Prisma.Decimal(130),
      }),
    ]);
  });

  it('flattens recent audit entries to the acting user name', async () => {
    audit.getRecent.mockResolvedValue([
      {
        id: 'log-1',
        entity: 'Order',
        entityId: 'order-1',
        action: 'CREATE',
        timestamp: new Date('2026-08-01'),
        user: { id: 'u1', name: 'Admin' },
      },
    ]);

    const result = await service.getSummary();

    expect(result.recentActivity).toEqual([
      {
        id: 'log-1',
        entity: 'Order',
        entityId: 'order-1',
        action: 'CREATE',
        userName: 'Admin',
        timestamp: new Date('2026-08-01'),
      },
    ]);
  });

  it('exposes recentWarnings from countRecentWarnings()', async () => {
    mockedCountRecentWarnings.mockReturnValue(4);

    const result = await service.getSummary();

    expect(result.recentWarnings).toBe(4);
  });
});
