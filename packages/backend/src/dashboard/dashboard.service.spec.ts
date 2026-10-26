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
    order: { groupBy: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    purchaseOrder: { findMany: jest.Mock };
    remission: { aggregate: jest.Mock };
  };
  let inventory: { getLowStockProducts: jest.Mock };
  let reports: {
    getInventoryReport: jest.Mock;
    getPayablesReport: jest.Mock;
  };
  let audit: { getRecent: jest.Mock };
  let service: DashboardService;

  beforeEach(() => {
    prisma = {
      productionOrder: { groupBy: jest.fn() },
      order: { groupBy: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      purchaseOrder: { findMany: jest.fn() },
      remission: { aggregate: jest.fn() },
    };
    inventory = { getLowStockProducts: jest.fn() };
    reports = {
      getInventoryReport: jest.fn(),
      getPayablesReport: jest.fn().mockResolvedValue([]),
    };
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
    prisma.order.count.mockResolvedValue(0);
    prisma.remission.aggregate.mockResolvedValue({
      _sum: { total: null, amountPaid: null },
      _count: 0,
    });
    prisma.purchaseOrder.findMany.mockResolvedValue([]);
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
      COMPLETADA: 3,
      CANCELADA: 0,
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
      DESPACHADO: 0,
      CANCELADO: 0,
    });
  });

  it('reports receivables as total minus paid over the remissions not fully paid', async () => {
    prisma.remission.aggregate.mockResolvedValue({
      _sum: {
        total: new Prisma.Decimal(500),
        amountPaid: new Prisma.Decimal(120),
      },
      _count: 3,
    });

    const result = await service.getSummary();

    expect(result.receivables.total.toString()).toBe('380');
    expect(result.receivables.remissionCount).toBe(3);
    expect(prisma.remission.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { voidedAt: null, paymentStatus: { not: 'PAGADO' } },
      }),
    );
  });

  it('lists overdue orders with their number and customer, oldest promise first', async () => {
    prisma.order.count.mockResolvedValue(1);
    prisma.order.findMany.mockImplementation(
      (args: { where?: { estimatedDeliveryDate?: unknown } }) =>
        Promise.resolve(
          args.where?.estimatedDeliveryDate
            ? [
                {
                  id: 'order-9',
                  number: 9,
                  status: 'EN_PRODUCCION',
                  estimatedDeliveryDate: new Date('2026-10-01'),
                  customer: { id: 'c1', name: 'Ferretería Sur' },
                },
              ]
            : [],
        ),
    );

    const result = await service.getSummary();

    expect(result.overdueOrders).toEqual({
      count: 1,
      orders: [
        {
          id: 'order-9',
          number: 9,
          customerName: 'Ferretería Sur',
          status: 'EN_PRODUCCION',
          estimatedDeliveryDate: new Date('2026-10-01'),
        },
      ],
    });
  });

  it('flattens recent purchases to their number, supplier and total', async () => {
    prisma.purchaseOrder.findMany.mockResolvedValue([
      {
        id: 'purchase-1',
        number: 4,
        status: 'PARCIAL',
        supplier: { id: 's1', name: 'Maderas del Sur' },
        _count: { items: 3 },
        total: new Prisma.Decimal(50),
        purchasedAt: new Date('2026-08-01'),
      },
    ]);

    const result = await service.getSummary();

    expect(result.recentPurchases).toEqual([
      {
        id: 'purchase-1',
        number: 4,
        supplierName: 'Maderas del Sur',
        status: 'PARCIAL',
        itemCount: 3,
        total: new Prisma.Decimal(50),
        purchasedAt: new Date('2026-08-01'),
      },
    ]);
  });

  it('adds up what is owed to suppliers from the payables report', async () => {
    reports.getPayablesReport.mockResolvedValue([
      { balance: new Prisma.Decimal(1200), purchaseOrderCount: 2 },
      { balance: new Prisma.Decimal(300), purchaseOrderCount: 1 },
    ]);

    const result = await service.getSummary();

    expect(result.payables.total.toNumber()).toBe(1500);
    expect(result.payables.purchaseOrderCount).toBe(3);
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
