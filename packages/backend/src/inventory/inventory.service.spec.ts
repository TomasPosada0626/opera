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
    product: { findUnique: jest.Mock; findMany: jest.Mock };
    warehouse: { findUnique: jest.Mock };
    stockMovement: {
      aggregate: jest.Mock;
      groupBy: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let service: InventoryService;

  beforeEach(() => {
    txStockMovement = { aggregate: jest.fn(), create: jest.fn() };
    prisma = {
      product: { findUnique: jest.fn(), findMany: jest.fn() },
      warehouse: { findUnique: jest.fn() },
      stockMovement: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
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
    it('returns movements paginated, ordered most-recent-first, scoped to the product', async () => {
      prisma.stockMovement.findMany.mockResolvedValue([
        { id: 'movement-2' },
        { id: 'movement-1' },
      ]);
      prisma.stockMovement.count.mockResolvedValue(2);

      const result = await service.getKardex('product-1', {});

      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: 'product-1' },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result).toEqual({
        data: [{ id: 'movement-2' }, { id: 'movement-1' }],
        meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      });
    });

    it('scopes to a single warehouse when warehouseId is given', async () => {
      prisma.stockMovement.findMany.mockResolvedValue([]);
      prisma.stockMovement.count.mockResolvedValue(0);

      await service.getKardex('product-1', { warehouseId: 'warehouse-1' });

      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: 'product-1', warehouseId: 'warehouse-1' },
        }),
      );
    });

    it('respects an explicit sortOrder override', async () => {
      prisma.stockMovement.findMany.mockResolvedValue([]);
      prisma.stockMovement.count.mockResolvedValue(0);

      await service.getKardex('product-1', { sortOrder: 'asc' });

      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
      );
    });
  });

  describe('getLowStockProducts', () => {
    it('returns an empty array when no product has a minStock threshold configured', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      const result = await service.getLowStockProducts();

      expect(result).toEqual([]);
      expect(prisma.stockMovement.groupBy).not.toHaveBeenCalled();
    });

    it('includes only products whose current stock is below minStock', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'product-1', minStock: new Prisma.Decimal(10) },
        { id: 'product-2', minStock: new Prisma.Decimal(5) },
      ]);
      prisma.stockMovement.groupBy.mockResolvedValue([
        { productId: 'product-1', _sum: { quantity: new Prisma.Decimal(3) } },
        { productId: 'product-2', _sum: { quantity: new Prisma.Decimal(20) } },
      ]);

      const result = await service.getLowStockProducts();

      expect(result.map((product) => product.id)).toEqual(['product-1']);
      expect(result[0].currentStock.toString()).toBe('3');
      expect(prisma.stockMovement.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: { in: ['product-1', 'product-2'] } },
        }),
      );
    });

    it('treats a product with no movements yet as zero stock', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'product-1', minStock: new Prisma.Decimal(10) },
      ]);
      prisma.stockMovement.groupBy.mockResolvedValue([]);

      const result = await service.getLowStockProducts();

      expect(result).toHaveLength(1);
      expect(result[0].currentStock.toString()).toBe('0');
    });
  });

  describe('getAverageCost', () => {
    it('returns zero when there are no movements yet', async () => {
      prisma.stockMovement.findMany.mockResolvedValue([]);

      const result = await service.getAverageCost('product-1');

      expect(result.toString()).toBe('0');
    });

    it('returns the unit cost of a single entrada', async () => {
      prisma.stockMovement.findMany.mockResolvedValue([
        { quantity: new Prisma.Decimal(10), unitCost: new Prisma.Decimal(2) },
      ]);

      const result = await service.getAverageCost('product-1');

      expect(result.toString()).toBe('2');
    });

    it('weights the average by quantity across multiple entradas', async () => {
      prisma.stockMovement.findMany.mockResolvedValue([
        { quantity: new Prisma.Decimal(10), unitCost: new Prisma.Decimal(2) },
        { quantity: new Prisma.Decimal(10), unitCost: new Prisma.Decimal(4) },
      ]);

      const result = await service.getAverageCost('product-1');

      // (10*2 + 10*4) / 20 = 3
      expect(result.toString()).toBe('3');
    });

    it('leaves the average unchanged after a salida, and recalculates on the next entrada', async () => {
      prisma.stockMovement.findMany.mockResolvedValue([
        { quantity: new Prisma.Decimal(10), unitCost: new Prisma.Decimal(2) },
        { quantity: new Prisma.Decimal(10), unitCost: new Prisma.Decimal(4) },
        { quantity: new Prisma.Decimal(-5), unitCost: null },
        { quantity: new Prisma.Decimal(5), unitCost: new Prisma.Decimal(9) },
      ]);

      const result = await service.getAverageCost('product-1');

      // tras las dos primeras: stock=20, avg=3. Salida no cambia avg (stock=15).
      // (15*3 + 5*9) / 20 = 90/20 = 4.5
      expect(result.toString()).toBe('4.5');
    });

    it('treats an entrada with no declared unitCost as entering at the current average', async () => {
      prisma.stockMovement.findMany.mockResolvedValue([
        { quantity: new Prisma.Decimal(10), unitCost: new Prisma.Decimal(2) },
        // Ajuste positivo sin costo declarado: no debe distorsionar el promedio.
        { quantity: new Prisma.Decimal(5), unitCost: null },
      ]);

      const result = await service.getAverageCost('product-1');

      expect(result.toString()).toBe('2');
    });

    it('scopes the calculation to a single warehouse when warehouseId is given', async () => {
      prisma.stockMovement.findMany.mockResolvedValue([]);

      await service.getAverageCost('product-1', 'warehouse-1');

      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: 'product-1', warehouseId: 'warehouse-1' },
          orderBy: { createdAt: 'asc' },
        }),
      );
    });
  });
});
