import { Prisma } from '@prisma/client';
import { Workbook } from 'exceljs';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

async function readSheet(buffer: Buffer, sheetName: string) {
  const workbook = new Workbook();
  // exceljs declara su propio `Buffer extends ArrayBuffer` ambiental, que no
  // coincide estructuralmente con el Buffer real de Node (subtipo de
  // Uint8Array) — el mismo objeto funciona en runtime, solo el tipeo choca.
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }
  return sheet;
}

describe('ReportsService', () => {
  let prisma: {
    product: { findMany: jest.Mock };
    stockMovement: { groupBy: jest.Mock };
    order: { findMany: jest.Mock };
    orderItem: { findMany: jest.Mock };
  };
  let inventory: { getAverageCostForProducts: jest.Mock };
  let service: ReportsService;

  beforeEach(() => {
    prisma = {
      product: { findMany: jest.fn() },
      stockMovement: { groupBy: jest.fn() },
      order: { findMany: jest.fn() },
      orderItem: { findMany: jest.fn() },
    };
    inventory = { getAverageCostForProducts: jest.fn() };
    service = new ReportsService(
      prisma as unknown as PrismaService,
      inventory as unknown as InventoryService,
    );
  });

  describe('getInventoryReport', () => {
    it('returns an empty array without querying stock when there are no active products', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      const result = await service.getInventoryReport();

      expect(result).toEqual([]);
      expect(prisma.stockMovement.groupBy).not.toHaveBeenCalled();
    });

    it('merges stock and average cost per product, defaulting stock to zero without movements', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'product-1',
          sku: 'SKU-1',
          name: 'Silla',
          category: { name: 'Muebles' },
          unit: { name: 'Unidad' },
        },
        {
          id: 'product-2',
          sku: 'SKU-2',
          name: 'Mesa',
          category: { name: 'Muebles' },
          unit: { name: 'Unidad' },
        },
      ]);
      prisma.stockMovement.groupBy.mockResolvedValue([
        { productId: 'product-1', _sum: { quantity: new Prisma.Decimal(8) } },
      ]);
      inventory.getAverageCostForProducts.mockResolvedValue(
        new Map([['product-1', new Prisma.Decimal(10)]]),
      );

      const result = await service.getInventoryReport();

      expect(inventory.getAverageCostForProducts).toHaveBeenCalledWith([
        'product-1',
        'product-2',
      ]);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'product-1',
          stock: new Prisma.Decimal(8),
          averageCost: new Prisma.Decimal(10),
          stockValue: new Prisma.Decimal(80),
        }),
      );
      expect(result[1]).toEqual(
        expect.objectContaining({
          id: 'product-2',
          stock: new Prisma.Decimal(0),
          stockValue: new Prisma.Decimal(0),
        }),
      );
    });
  });

  describe('getSalesReport', () => {
    it('excludes CANCELADO orders and sums quantity/revenue across lines', async () => {
      prisma.order.findMany.mockResolvedValue([
        {
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
        {
          items: [
            {
              quantity: new Prisma.Decimal(3),
              unitPrice: new Prisma.Decimal(10),
            },
          ],
        },
      ]);

      const result = await service.getSalesReport({});

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: { not: 'CANCELADO' } },
        }),
      );
      expect(result.orderCount).toBe(2);
      expect(result.totalQuantity.toString()).toBe('6');
      // (2*50 + 1*30) + (3*10) = 130 + 30 = 160
      expect(result.totalRevenue.toString()).toBe('160');
    });

    it('applies the date range as a half-open [from, to) filter', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.getSalesReport({ from: '2026-08-01', to: '2026-09-01' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: { not: 'CANCELADO' },
            createdAt: {
              gte: new Date('2026-08-01'),
              lt: new Date('2026-09-01'),
            },
          },
        }),
      );
    });

    it('returns zeroed totals when no orders match', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      const result = await service.getSalesReport({});

      expect(result.orderCount).toBe(0);
      expect(result.totalQuantity.toString()).toBe('0');
      expect(result.totalRevenue.toString()).toBe('0');
    });
  });

  describe('getTopProducts', () => {
    const items = [
      {
        productId: 'product-1',
        product: { id: 'product-1', sku: 'SKU-1', name: 'Silla' },
        quantity: new Prisma.Decimal(5),
        unitPrice: new Prisma.Decimal(10),
      },
      {
        productId: 'product-2',
        product: { id: 'product-2', sku: 'SKU-2', name: 'Mesa' },
        quantity: new Prisma.Decimal(2),
        unitPrice: new Prisma.Decimal(100),
      },
      {
        productId: 'product-1',
        product: { id: 'product-1', sku: 'SKU-1', name: 'Silla' },
        quantity: new Prisma.Decimal(3),
        unitPrice: new Prisma.Decimal(10),
      },
    ];

    it('aggregates quantity and revenue per product across order items, sorted by most sold by default', async () => {
      prisma.orderItem.findMany.mockResolvedValue(items);

      const result = await service.getTopProducts({});

      expect(result).toEqual([
        expect.objectContaining({
          productId: 'product-1',
          quantitySold: new Prisma.Decimal(8),
          revenue: new Prisma.Decimal(80),
        }),
        expect.objectContaining({
          productId: 'product-2',
          quantitySold: new Prisma.Decimal(2),
          revenue: new Prisma.Decimal(200),
        }),
      ]);
    });

    it('sorts least-sold first when sortOrder is asc', async () => {
      prisma.orderItem.findMany.mockResolvedValue(items);

      const result = await service.getTopProducts({ sortOrder: 'asc' });

      expect(result.map((row) => row.productId)).toEqual([
        'product-2',
        'product-1',
      ]);
    });

    it('respects the limit', async () => {
      prisma.orderItem.findMany.mockResolvedValue(items);

      const result = await service.getTopProducts({ limit: 1 });

      expect(result).toHaveLength(1);
      expect(result[0].productId).toBe('product-1');
    });

    it('filters by non-cancelled orders and the given date range', async () => {
      prisma.orderItem.findMany.mockResolvedValue([]);

      await service.getTopProducts({ from: '2026-08-01' });

      expect(prisma.orderItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            order: {
              status: { not: 'CANCELADO' },
              createdAt: { gte: new Date('2026-08-01') },
            },
          },
        }),
      );
    });
  });

  describe('getInventoryExcel', () => {
    it('writes a row per product with the same numbers as the JSON report', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'product-1',
          sku: 'SKU-1',
          name: 'Silla',
          category: { name: 'Muebles' },
          unit: { name: 'Unidad' },
        },
      ]);
      prisma.stockMovement.groupBy.mockResolvedValue([
        { productId: 'product-1', _sum: { quantity: new Prisma.Decimal(8) } },
      ]);
      inventory.getAverageCostForProducts.mockResolvedValue(
        new Map([['product-1', new Prisma.Decimal(10)]]),
      );

      const buffer = await service.getInventoryExcel();

      const sheet = await readSheet(buffer, 'Inventario');
      expect(sheet.getRow(1).getCell(1).value).toBe('SKU');
      expect(sheet.getRow(2).getCell(1).value).toBe('SKU-1');
      expect(sheet.getRow(2).getCell(5).value).toBe(8);
      expect(sheet.getRow(2).getCell(6).value).toBe(10);
      expect(sheet.getRow(2).getCell(7).value).toBe(80);
    });
  });

  describe('getSalesExcel', () => {
    it('writes a single summary row with the same totals as the JSON report', async () => {
      prisma.order.findMany.mockResolvedValue([
        {
          items: [
            {
              quantity: new Prisma.Decimal(2),
              unitPrice: new Prisma.Decimal(50),
            },
          ],
        },
      ]);

      const buffer = await service.getSalesExcel({});

      const sheet = await readSheet(buffer, 'Ventas');
      expect(sheet.getRow(1).getCell(3).value).toBe('Pedidos');
      expect(sheet.getRow(2).getCell(3).value).toBe(1);
      expect(sheet.getRow(2).getCell(4).value).toBe(2);
      expect(sheet.getRow(2).getCell(5).value).toBe(100);
    });
  });

  describe('getTopProductsExcel', () => {
    it('writes a row per ranked product with the same numbers as the JSON report', async () => {
      prisma.orderItem.findMany.mockResolvedValue([
        {
          productId: 'product-1',
          product: { id: 'product-1', sku: 'SKU-1', name: 'Silla' },
          quantity: new Prisma.Decimal(5),
          unitPrice: new Prisma.Decimal(10),
        },
      ]);

      const buffer = await service.getTopProductsExcel({});

      const sheet = await readSheet(buffer, 'Productos más vendidos');
      expect(sheet.getRow(1).getCell(1).value).toBe('SKU');
      expect(sheet.getRow(2).getCell(1).value).toBe('SKU-1');
      expect(sheet.getRow(2).getCell(3).value).toBe(5);
      expect(sheet.getRow(2).getCell(4).value).toBe(50);
    });
  });
});
