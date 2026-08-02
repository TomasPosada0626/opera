import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';

describe('InventoryService', () => {
  let prisma: {
    product: { findUnique: jest.Mock };
    stockMovement: { aggregate: jest.Mock; groupBy: jest.Mock };
  };
  let service: InventoryService;

  beforeEach(() => {
    prisma = {
      product: { findUnique: jest.fn() },
      stockMovement: { aggregate: jest.fn(), groupBy: jest.fn() },
    };
    service = new InventoryService(prisma as unknown as PrismaService);
  });

  describe('assertProductExists', () => {
    it('throws NotFoundException when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.assertProductExists('missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resolves without throwing when the product exists', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'product-1' });

      await expect(
        service.assertProductExists('product-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('getStock', () => {
    it('returns the summed quantity for a product across all warehouses', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({
        _sum: { quantity: new Prisma.Decimal(42) },
      });

      const result = await service.getStock('product-1');

      expect(prisma.stockMovement.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { productId: 'product-1' } }),
      );
      expect(result.toString()).toBe('42');
    });

    it('scopes the sum to a single warehouse when warehouseId is given', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({
        _sum: { quantity: new Prisma.Decimal(7) },
      });

      await service.getStock('product-1', 'warehouse-1');

      expect(prisma.stockMovement.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: 'product-1', warehouseId: 'warehouse-1' },
        }),
      );
    });

    it('returns zero when there are no movements yet', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({
        _sum: { quantity: null },
      });

      const result = await service.getStock('product-1');

      expect(result.toString()).toBe('0');
    });
  });

  describe('getStockByWarehouse', () => {
    it('returns a stock breakdown per warehouse', async () => {
      prisma.stockMovement.groupBy.mockResolvedValue([
        {
          warehouseId: 'warehouse-1',
          _sum: { quantity: new Prisma.Decimal(10) },
        },
        { warehouseId: 'warehouse-2', _sum: { quantity: null } },
      ]);

      const result = await service.getStockByWarehouse('product-1');

      expect(
        result.map(({ warehouseId, stock }) => ({
          warehouseId,
          stock: stock.toString(),
        })),
      ).toEqual([
        { warehouseId: 'warehouse-1', stock: '10' },
        { warehouseId: 'warehouse-2', stock: '0' },
      ]);
    });
  });
});
