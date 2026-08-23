import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('OrdersService', () => {
  const customer = { id: 'customer-1', name: 'Cliente de prueba' };
  const warehouse = { id: 'warehouse-1', name: 'Bodega principal' };
  const product = { id: 'product-1', name: 'Silla de madera' };
  const baseOrder = {
    id: 'order-1',
    customerId: customer.id,
    warehouseId: warehouse.id,
    userId: 'acting-user',
    status: 'PENDIENTE',
    items: [
      { id: 'item-1', productId: product.id, quantity: '2', unitPrice: '50' },
    ],
  };

  let prisma: {
    customer: { findUnique: jest.Mock };
    warehouse: { findUnique: jest.Mock };
    product: { findMany: jest.Mock };
    order: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let service: OrdersService;

  // La transacción de markWarehoused se mockea ejecutando el callback
  // contra un `tx` falso — mismo espíritu que el resto de specs de este
  // proyecto, no hace falta Postgres real para probar la lógica.
  function txStub(overrides: {
    orderUpdate?: unknown;
    movementCreate?: jest.Mock;
  }) {
    return {
      order: {
        update: jest.fn().mockResolvedValue(overrides.orderUpdate),
      },
      stockMovement: {
        create: overrides.movementCreate ?? jest.fn(),
      },
    };
  }
  type TxStub = ReturnType<typeof txStub>;

  beforeEach(() => {
    prisma = {
      customer: { findUnique: jest.fn() },
      warehouse: { findUnique: jest.fn() },
      product: { findMany: jest.fn() },
      order: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };
    service = new OrdersService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );

    prisma.customer.findUnique.mockResolvedValue(customer);
    prisma.warehouse.findUnique.mockResolvedValue(warehouse);
    prisma.product.findMany.mockResolvedValue([product]);
  });

  describe('create', () => {
    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            customerId: 'missing',
            warehouseId: warehouse.id,
            items: [{ productId: product.id, quantity: 1, unitPrice: 10 }],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the warehouse does not exist', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            customerId: customer.id,
            warehouseId: 'missing',
            items: [{ productId: product.id, quantity: 1, unitPrice: 10 }],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when an item references a product that does not exist', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await expect(
        service.create(
          {
            customerId: customer.id,
            warehouseId: warehouse.id,
            items: [{ productId: 'missing', quantity: 1, unitPrice: 10 }],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('creates the order PENDIENTE, without touching stock, and logs a CREATE audit entry', async () => {
      prisma.order.create.mockResolvedValue(baseOrder);

      const result = await service.create(
        {
          customerId: customer.id,
          warehouseId: warehouse.id,
          items: [{ productId: product.id, quantity: 2, unitPrice: 50 }],
        },
        'acting-user',
      );

      expect(result).toEqual(baseOrder);
      const createCalls = prisma.order.create.mock.calls as [
        [{ data: { customerId: string; warehouseId: string; userId: string } }],
      ];
      expect(createCalls[0][0].data).toEqual(
        expect.objectContaining({
          customerId: customer.id,
          warehouseId: warehouse.id,
          userId: 'acting-user',
        }),
      );
      // Este negocio fabrica sobre pedido — crear el pedido no debe tocar
      // stock en absoluto, a diferencia del diseño original.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'Order',
          userId: 'acting-user',
        }),
      );
    });
  });

  describe('findAll / findOne', () => {
    it('lists orders paginated, newest first by default', async () => {
      prisma.order.findMany.mockResolvedValue([baseOrder]);
      prisma.order.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result).toEqual({
        data: [baseOrder],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('throws NotFoundException when findOne cannot find the order', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('filters by status when provided', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.findAll({ status: 'EN_PRODUCCION' });

      expect(prisma.order.count).toHaveBeenCalledWith({
        where: { status: 'EN_PRODUCCION' },
      });
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'EN_PRODUCCION' } }),
      );
    });

    it('does not filter by status when omitted', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.findAll({});

      expect(prisma.order.count).toHaveBeenCalledWith({ where: undefined });
    });
  });

  describe('markProduction', () => {
    it('throws BadRequestException when the order is not PENDIENTE', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: 'EN_PRODUCCION',
      });

      await expect(
        service.markProduction('order-1', 'acting-user'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the guarded update matches no rows (lost the race)', async () => {
      prisma.order.findUnique.mockResolvedValue(baseOrder);
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.markProduction('order-1', 'acting-user'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('marks the order EN_PRODUCCION with a timestamp and logs the transition', async () => {
      prisma.order.findUnique
        .mockResolvedValueOnce(baseOrder)
        .mockResolvedValueOnce({
          ...baseOrder,
          status: 'EN_PRODUCCION',
          productionStartedAt: new Date('2026-01-01'),
        });
      prisma.order.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markProduction('order-1', 'acting-user');

      const updateManyCalls = prisma.order.updateMany.mock.calls as [
        [{ where: { id: string; status: string }; data: { status: string } }],
      ];
      expect(updateManyCalls[0][0].where).toEqual({
        id: 'order-1',
        status: 'PENDIENTE',
      });
      expect(updateManyCalls[0][0].data.status).toBe('EN_PRODUCCION');
      expect(result.status).toBe('EN_PRODUCCION');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MARK_PRODUCTION' }),
      );
    });
  });

  describe('markWarehoused', () => {
    it('throws NotFoundException when the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.markWarehoused('missing', 'acting-user'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the order is not EN_PRODUCCION', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: 'PENDIENTE',
      });

      await expect(
        service.markWarehoused('order-1', 'acting-user'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('writes an ENTRADA per line, updates status to EN_ALMACEN, and logs the transition', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: 'EN_PRODUCCION',
      });
      const movementCreate = jest.fn();
      const orderUpdate = jest.fn().mockResolvedValue({
        ...baseOrder,
        status: 'EN_ALMACEN',
        warehousedAt: new Date('2026-01-02'),
      });
      prisma.$transaction.mockImplementation(
        (callback: (tx: TxStub) => Promise<unknown>) => {
          const tx = txStub({ movementCreate });
          tx.order.update = orderUpdate;
          return callback(tx);
        },
      );

      const result = await service.markWarehoused('order-1', 'acting-user');

      expect(result.status).toBe('EN_ALMACEN');
      const movementCalls = movementCreate.mock.calls as [
        [{ data: { productId: string; type: string; quantity: string } }],
      ];
      expect(movementCalls[0][0].data).toEqual(
        expect.objectContaining({
          productId: product.id,
          type: 'ENTRADA',
          quantity: '2',
        }),
      );
      const orderUpdateCalls = orderUpdate.mock.calls as [
        [{ data: { status: string } }],
      ];
      expect(orderUpdateCalls[0][0].data.status).toBe('EN_ALMACEN');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MARK_WAREHOUSED' }),
      );
    });

    it('converts a P2034/P2028 concurrency error into ConflictException', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: 'EN_PRODUCCION',
      });
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2034',
          clientVersion: '6.19.3',
        }),
      );

      await expect(
        service.markWarehoused('order-1', 'acting-user'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
