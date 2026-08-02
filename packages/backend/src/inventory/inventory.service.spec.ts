import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';

describe('InventoryService', () => {
  let prisma: {
    product: { findUnique: jest.Mock };
    warehouse: { findUnique: jest.Mock };
    stockMovement: {
      aggregate: jest.Mock;
      groupBy: jest.Mock;
      create: jest.Mock;
    };
  };
  let service: InventoryService;

  beforeEach(() => {
    prisma = {
      product: { findUnique: jest.fn() },
      warehouse: { findUnique: jest.fn() },
      stockMovement: {
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        create: jest.fn(),
      },
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

  describe('createEntry', () => {
    const dto = {
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      quantity: 25,
    };

    it('throws NotFoundException when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      prisma.warehouse.findUnique.mockResolvedValue({ id: 'warehouse-1' });

      await expect(
        service.createEntry(dto, 'acting-user'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the warehouse does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'product-1' });
      prisma.warehouse.findUnique.mockResolvedValue(null);

      await expect(
        service.createEntry(dto, 'acting-user'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('creates a positive-quantity ENTRADA movement for the acting user', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'product-1' });
      prisma.warehouse.findUnique.mockResolvedValue({ id: 'warehouse-1' });
      prisma.stockMovement.create.mockResolvedValue({
        id: 'movement-1',
        ...dto,
        type: 'ENTRADA',
      });

      await service.createEntry(dto, 'acting-user');

      expect(prisma.stockMovement.create).toHaveBeenCalledWith({
        data: {
          productId: 'product-1',
          warehouseId: 'warehouse-1',
          type: 'ENTRADA',
          quantity: 25,
          reason: undefined,
          location: undefined,
          userId: 'acting-user',
        },
      });
    });
  });
});
