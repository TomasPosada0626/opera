import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';

describe('InventoryService', () => {
  let txStockMovement: { aggregate: jest.Mock; create: jest.Mock };
  let prisma: {
    product: { findUnique: jest.Mock };
    warehouse: { findUnique: jest.Mock };
    stockMovement: {
      aggregate: jest.Mock;
      groupBy: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let service: InventoryService;

  beforeEach(() => {
    txStockMovement = { aggregate: jest.fn(), create: jest.fn() };
    prisma = {
      product: { findUnique: jest.fn() },
      warehouse: { findUnique: jest.fn() },
      stockMovement: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({ stockMovement: txStockMovement }),
      ),
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

  describe('createExit', () => {
    const dto = {
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      quantity: 30,
    };

    beforeEach(() => {
      prisma.product.findUnique.mockResolvedValue({ id: 'product-1' });
      prisma.warehouse.findUnique.mockResolvedValue({ id: 'warehouse-1' });
    });

    it('throws BadRequestException when there is not enough stock', async () => {
      txStockMovement.aggregate.mockResolvedValue({
        _sum: { quantity: new Prisma.Decimal(10) },
      });

      await expect(
        service.createExit(dto, 'acting-user'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(txStockMovement.create).not.toHaveBeenCalled();
    });

    it('creates a negative-quantity SALIDA movement inside a Serializable transaction', async () => {
      txStockMovement.aggregate.mockResolvedValue({
        _sum: { quantity: new Prisma.Decimal(100) },
      });
      txStockMovement.create.mockResolvedValue({ id: 'movement-1' });

      await service.createExit(dto, 'acting-user');

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      expect(txStockMovement.create).toHaveBeenCalledWith({
        data: {
          productId: 'product-1',
          warehouseId: 'warehouse-1',
          type: 'SALIDA',
          quantity: -30,
          reason: undefined,
          location: undefined,
          userId: 'acting-user',
        },
      });
    });

    it('converts a P2034 write-conflict error into ConflictException', async () => {
      txStockMovement.aggregate.mockResolvedValue({
        _sum: { quantity: new Prisma.Decimal(100) },
      });
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2034',
          clientVersion: '6.19.3',
        }),
      );

      await expect(
        service.createExit(dto, 'acting-user'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('createAdjustment', () => {
    beforeEach(() => {
      prisma.product.findUnique.mockResolvedValue({ id: 'product-1' });
      prisma.warehouse.findUnique.mockResolvedValue({ id: 'warehouse-1' });
    });

    it('allows a positive adjustment (correcting stock upward)', async () => {
      txStockMovement.aggregate.mockResolvedValue({
        _sum: { quantity: new Prisma.Decimal(10) },
      });
      txStockMovement.create.mockResolvedValue({ id: 'movement-1' });

      await service.createAdjustment(
        {
          productId: 'product-1',
          warehouseId: 'warehouse-1',
          quantity: 15,
          reason: 'Conteo físico',
        },
        'acting-user',
      );

      expect(txStockMovement.create).toHaveBeenCalledWith({
        data: {
          productId: 'product-1',
          warehouseId: 'warehouse-1',
          type: 'AJUSTE',
          quantity: 15,
          reason: 'Conteo físico',
          location: undefined,
          userId: 'acting-user',
        },
      });
    });

    it('allows a negative adjustment as long as the result does not go below zero', async () => {
      txStockMovement.aggregate.mockResolvedValue({
        _sum: { quantity: new Prisma.Decimal(10) },
      });
      txStockMovement.create.mockResolvedValue({ id: 'movement-1' });

      await service.createAdjustment(
        {
          productId: 'product-1',
          warehouseId: 'warehouse-1',
          quantity: -4,
          reason: 'Merma',
        },
        'acting-user',
      );

      expect(txStockMovement.create).toHaveBeenCalledWith({
        data: {
          productId: 'product-1',
          warehouseId: 'warehouse-1',
          type: 'AJUSTE',
          quantity: -4,
          reason: 'Merma',
          location: undefined,
          userId: 'acting-user',
        },
      });
    });

    it('rejects a negative adjustment that would push stock below zero', async () => {
      txStockMovement.aggregate.mockResolvedValue({
        _sum: { quantity: new Prisma.Decimal(10) },
      });

      await expect(
        service.createAdjustment(
          {
            productId: 'product-1',
            warehouseId: 'warehouse-1',
            quantity: -20,
            reason: 'Merma',
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(txStockMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('getKardex', () => {
    it('returns movements ordered most-recent-first, scoped to the product', async () => {
      prisma.stockMovement.findMany.mockResolvedValue([
        { id: 'movement-2' },
        { id: 'movement-1' },
      ]);

      const result = await service.getKardex('product-1');

      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: 'product-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual([{ id: 'movement-2' }, { id: 'movement-1' }]);
    });

    it('scopes to a single warehouse when warehouseId is given', async () => {
      prisma.stockMovement.findMany.mockResolvedValue([]);

      await service.getKardex('product-1', 'warehouse-1');

      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: 'product-1', warehouseId: 'warehouse-1' },
        }),
      );
    });
  });
});
