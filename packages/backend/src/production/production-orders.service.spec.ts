import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductionOrdersService } from './production-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';

describe('ProductionOrdersService', () => {
  const finishedGood = { id: 'product-1', type: 'FINISHED_GOOD' };
  const warehouse = { id: 'warehouse-1' };
  const componentA = { id: 'component-a', name: 'Materia A' };
  const componentB = { id: 'component-b', name: 'Materia B' };

  const bomWithItems = {
    id: 'bom-1',
    productId: 'product-1',
    isActive: true,
    items: [
      {
        id: 'item-1',
        componentId: 'component-a',
        component: componentA,
        quantity: new Prisma.Decimal(2),
      },
      {
        id: 'item-2',
        componentId: 'component-b',
        component: componentB,
        quantity: new Prisma.Decimal(1),
      },
    ],
  };

  let txClient: {
    billOfMaterials: { findUnique: jest.Mock };
    stockMovement: { create: jest.Mock };
    productionOrder: { updateMany: jest.Mock; findUniqueOrThrow: jest.Mock };
  };
  let prisma: {
    product: { findUnique: jest.Mock };
    warehouse: { findUnique: jest.Mock };
    billOfMaterials: { findUnique: jest.Mock };
    productionOrder: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let inventory: {
    getStock: jest.Mock;
    getAverageCost: jest.Mock;
    getStockForProducts: jest.Mock;
    getAverageCostForProducts: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let service: ProductionOrdersService;

  beforeEach(() => {
    txClient = {
      billOfMaterials: { findUnique: jest.fn() },
      stockMovement: { create: jest.fn() },
      productionOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn(),
      },
    };
    prisma = {
      product: { findUnique: jest.fn() },
      warehouse: { findUnique: jest.fn() },
      billOfMaterials: { findUnique: jest.fn() },
      productionOrder: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(txClient),
      ),
    };
    inventory = {
      getStock: jest.fn(),
      getAverageCost: jest.fn(),
      getStockForProducts: jest.fn(),
      getAverageCostForProducts: jest.fn(),
    };
    audit = { log: jest.fn() };
    service = new ProductionOrdersService(
      prisma as unknown as PrismaService,
      inventory as unknown as InventoryService,
      audit as unknown as AuditService,
    );
  });

  describe('findOne', () => {
    it('throws NotFoundException when the order does not exist', async () => {
      prisma.productionOrder.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the order with product and warehouse included', async () => {
      const order = { id: 'order-1', product: finishedGood, warehouse };
      prisma.productionOrder.findUnique.mockResolvedValue(order);

      const result = await service.findOne('order-1');

      expect(result).toEqual(order);
    });
  });

  describe('findAll', () => {
    it('lists orders paginated, most recent first by default', async () => {
      prisma.productionOrder.findMany.mockResolvedValue([]);
      prisma.productionOrder.count.mockResolvedValue(0);

      await service.findAll({});

      expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
    });
  });

  describe('create', () => {
    const dto = {
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      quantity: 10,
    };

    it('throws NotFoundException when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, 'acting-user')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the product is not a finished good', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'product-1',
        type: 'RAW_MATERIAL',
      });

      await expect(service.create(dto, 'acting-user')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFoundException when the warehouse does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(finishedGood);
      prisma.warehouse.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, 'acting-user')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the product has no active recipe', async () => {
      prisma.product.findUnique.mockResolvedValue(finishedGood);
      prisma.warehouse.findUnique.mockResolvedValue(warehouse);
      prisma.billOfMaterials.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, 'acting-user')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException when the recipe is inactive', async () => {
      prisma.product.findUnique.mockResolvedValue(finishedGood);
      prisma.warehouse.findUnique.mockResolvedValue(warehouse);
      prisma.billOfMaterials.findUnique.mockResolvedValue({
        ...bomWithItems,
        isActive: false,
      });

      await expect(service.create(dto, 'acting-user')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException listing shortages when a component lacks stock', async () => {
      prisma.product.findUnique.mockResolvedValue(finishedGood);
      prisma.warehouse.findUnique.mockResolvedValue(warehouse);
      prisma.billOfMaterials.findUnique.mockResolvedValue(bomWithItems);
      // Necesita 2*10=20 de A y 1*10=10 de B; A alcanza, B no.
      inventory.getStock
        .mockResolvedValueOnce(new Prisma.Decimal(20))
        .mockResolvedValueOnce(new Prisma.Decimal(5));

      await expect(service.create(dto, 'acting-user')).rejects.toMatchObject({
        response: {
          shortages: [
            {
              componentId: 'component-b',
              componentName: 'Materia B',
              required: '10',
              available: '5',
            },
          ],
        },
      });
      expect(prisma.productionOrder.create).not.toHaveBeenCalled();
    });

    it('creates the order and logs a CREATE audit entry when stock is sufficient', async () => {
      prisma.product.findUnique.mockResolvedValue(finishedGood);
      prisma.warehouse.findUnique.mockResolvedValue(warehouse);
      prisma.billOfMaterials.findUnique.mockResolvedValue(bomWithItems);
      inventory.getStock
        .mockResolvedValueOnce(new Prisma.Decimal(20))
        .mockResolvedValueOnce(new Prisma.Decimal(10));
      prisma.productionOrder.create.mockResolvedValue({
        id: 'order-1',
        ...dto,
        status: 'PENDIENTE',
      });

      const result = await service.create(dto, 'acting-user');

      expect(prisma.productionOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            productId: 'product-1',
            warehouseId: 'warehouse-1',
            quantity: 10,
            userId: 'acting-user',
          },
        }),
      );
      expect(result.id).toBe('order-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'ProductionOrder',
          userId: 'acting-user',
        }),
      );
    });
  });

  describe('complete', () => {
    const pendingOrder = {
      id: 'order-1',
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      quantity: 10,
      status: 'PENDIENTE',
    };

    it('throws NotFoundException when the order does not exist', async () => {
      prisma.productionOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.complete('missing', 'acting-user'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when the order is not PENDIENTE', async () => {
      prisma.productionOrder.findUnique.mockResolvedValue({
        ...pendingOrder,
        status: 'COMPLETADA',
      });

      await expect(
        service.complete('order-1', 'acting-user'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the recipe is no longer active', async () => {
      prisma.productionOrder.findUnique.mockResolvedValue(pendingOrder);
      txClient.billOfMaterials.findUnique.mockResolvedValue(null);

      await expect(
        service.complete('order-1', 'acting-user'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(txClient.stockMovement.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException listing shortages when a component lacks stock', async () => {
      prisma.productionOrder.findUnique.mockResolvedValue(pendingOrder);
      txClient.billOfMaterials.findUnique.mockResolvedValue(bomWithItems);
      inventory.getStockForProducts.mockResolvedValue([
        { productId: 'component-a', stock: new Prisma.Decimal(20) },
        { productId: 'component-b', stock: new Prisma.Decimal(5) },
      ]);
      inventory.getAverageCostForProducts.mockResolvedValue(
        new Map([
          ['component-a', new Prisma.Decimal(1)],
          ['component-b', new Prisma.Decimal(1)],
        ]),
      );

      await expect(
        service.complete('order-1', 'acting-user'),
      ).rejects.toMatchObject({
        response: {
          shortages: [expect.objectContaining({ componentId: 'component-b' })],
        },
      });
      expect(txClient.stockMovement.create).not.toHaveBeenCalled();
    });

    it('creates a SALIDA per component (costed at the current average), an ENTRADA for the finished good (costed at total/quantity), and marks the order COMPLETADA', async () => {
      prisma.productionOrder.findUnique.mockResolvedValue(pendingOrder);
      txClient.billOfMaterials.findUnique.mockResolvedValue(bomWithItems);
      inventory.getStockForProducts.mockResolvedValue([
        { productId: 'component-a', stock: new Prisma.Decimal(20) },
        { productId: 'component-b', stock: new Prisma.Decimal(10) },
      ]);
      // component-a cuesta 2/unidad, component-b cuesta 3/unidad.
      inventory.getAverageCostForProducts.mockResolvedValue(
        new Map([
          ['component-a', new Prisma.Decimal(2)],
          ['component-b', new Prisma.Decimal(3)],
        ]),
      );
      txClient.productionOrder.findUniqueOrThrow.mockResolvedValue({
        ...pendingOrder,
        status: 'COMPLETADA',
        completedAt: new Date('2026-01-01'),
      });

      const result = await service.complete('order-1', 'acting-user');

      const calls = txClient.stockMovement.create.mock.calls as [
        {
          data: {
            productId: string;
            type: string;
            quantity: Prisma.Decimal;
            unitCost: Prisma.Decimal;
          };
        },
      ][];
      const movements = calls.map(([{ data }]) => ({
        productId: data.productId,
        type: data.type,
        quantity: data.quantity.toString(),
        unitCost: data.unitCost.toString(),
      }));
      // required: 2*10=20 de A a 2/u = 40; 1*10=10 de B a 3/u = 30. total=70,
      // costo del terminado = 70/10 (order.quantity) = 7.
      expect(movements).toEqual(
        expect.arrayContaining([
          {
            productId: 'component-a',
            type: 'SALIDA',
            quantity: '-20',
            unitCost: '2',
          },
          {
            productId: 'component-b',
            type: 'SALIDA',
            quantity: '-10',
            unitCost: '3',
          },
          {
            productId: 'product-1',
            type: 'ENTRADA',
            quantity: '10',
            unitCost: '7',
          },
        ]),
      );
      const [[updateArgs]] = txClient.productionOrder.updateMany.mock.calls as [
        {
          where: { id: string; status: string };
          data: {
            status: string;
            totalCost: Prisma.Decimal;
            unitCost: Prisma.Decimal;
          };
        },
      ][];
      expect(updateArgs.where).toEqual({ id: 'order-1', status: 'PENDIENTE' });
      expect(updateArgs.data.status).toBe('COMPLETADA');
      expect(updateArgs.data.totalCost.toString()).toBe('70');
      expect(updateArgs.data.unitCost.toString()).toBe('7');
      expect(result.status).toBe('COMPLETADA');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COMPLETE',
          entity: 'ProductionOrder',
          entityId: 'order-1',
        }),
      );
    });

    it('converts a P2034 write-conflict error into ConflictException', async () => {
      prisma.productionOrder.findUnique.mockResolvedValue(pendingOrder);
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2034',
          clientVersion: '6.19.3',
        }),
      );

      await expect(
        service.complete('order-1', 'acting-user'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('converts an atomic guard miss (count 0) into ConflictException', async () => {
      prisma.productionOrder.findUnique.mockResolvedValue(pendingOrder);
      txClient.billOfMaterials.findUnique.mockResolvedValue(bomWithItems);
      inventory.getStockForProducts.mockResolvedValue([
        { productId: 'component-a', stock: new Prisma.Decimal(20) },
        { productId: 'component-b', stock: new Prisma.Decimal(10) },
      ]);
      inventory.getAverageCostForProducts.mockResolvedValue(
        new Map([
          ['component-a', new Prisma.Decimal(2)],
          ['component-b', new Prisma.Decimal(3)],
        ]),
      );
      txClient.productionOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.complete('order-1', 'acting-user'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('cancel', () => {
    it('throws NotFoundException when the order does not exist', async () => {
      prisma.productionOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.cancel('missing', 'acting-user'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.productionOrder.updateMany).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the order is not PENDIENTE', async () => {
      prisma.productionOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        status: 'COMPLETADA',
      });

      await expect(
        service.cancel('order-1', 'acting-user'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.productionOrder.updateMany).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the guarded update matches no rows (lost the race)', async () => {
      prisma.productionOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        status: 'PENDIENTE',
      });
      prisma.productionOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.cancel('order-1', 'acting-user'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('cancels a PENDIENTE order without touching stock and logs the transition', async () => {
      prisma.productionOrder.findUnique
        .mockResolvedValueOnce({ id: 'order-1', status: 'PENDIENTE' })
        .mockResolvedValueOnce({ id: 'order-1', status: 'CANCELADA' });
      prisma.productionOrder.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cancel('order-1', 'acting-user');

      expect(prisma.productionOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', status: 'PENDIENTE' },
        data: { status: 'CANCELADA' },
      });
      expect(result.status).toBe('CANCELADA');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CANCEL',
          entity: 'ProductionOrder',
        }),
      );
    });
  });
});
