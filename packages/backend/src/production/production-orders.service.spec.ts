import { BadRequestException, NotFoundException } from '@nestjs/common';
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

  let prisma: {
    product: { findUnique: jest.Mock };
    warehouse: { findUnique: jest.Mock };
    billOfMaterials: { findUnique: jest.Mock };
    productionOrder: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
    };
  };
  let inventory: { getStock: jest.Mock };
  let audit: { log: jest.Mock };
  let service: ProductionOrdersService;

  beforeEach(() => {
    prisma = {
      product: { findUnique: jest.fn() },
      warehouse: { findUnique: jest.fn() },
      billOfMaterials: { findUnique: jest.fn() },
      productionOrder: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
    };
    inventory = { getStock: jest.fn() };
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
});
