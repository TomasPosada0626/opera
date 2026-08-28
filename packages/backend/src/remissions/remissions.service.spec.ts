import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RemissionsService } from './remissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';

describe('RemissionsService', () => {
  const orderItem = {
    id: 'order-item-1',
    productId: 'product-1',
    quantity: new Prisma.Decimal(10),
    product: { id: 'product-1', name: 'Silla de madera' },
  };
  const order = {
    id: 'order-1',
    warehouseId: 'warehouse-1',
    status: 'EN_ALMACEN',
    items: [orderItem],
  };
  const baseRemission = {
    id: 'remission-1',
    number: 1,
    orderId: order.id,
    userId: 'acting-user',
    paymentStatus: 'CARTERA',
    amountPaid: null,
    createdAt: new Date('2026-01-01'),
    order: {
      warehouseId: order.warehouseId,
      customer: { name: 'Cliente de prueba' },
      warehouse: { name: 'Bodega principal' },
    },
    user: { id: 'acting-user', name: 'Admin' },
    voidedAt: null,
    voidReason: null,
    items: [
      {
        id: 'remission-item-1',
        orderItemId: orderItem.id,
        quantity: new Prisma.Decimal(4),
        orderItem: {
          productId: orderItem.productId,
          product: orderItem.product,
        },
      },
    ],
  };

  let prisma: {
    order: { findUnique: jest.Mock };
    remission: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let inventory: { getStock: jest.Mock };
  let audit: { log: jest.Mock };
  let service: RemissionsService;

  // Mismo espíritu que orders.service.spec.ts: la transacción se mockea
  // ejecutando el callback contra un `tx` falso, no un Postgres real.
  function txStub(overrides: {
    alreadyDelivered?: Prisma.Decimal;
    remissionCreate?: unknown;
    movementCreateMany?: jest.Mock;
  }) {
    return {
      remissionItem: {
        groupBy: jest.fn().mockResolvedValue(
          overrides.alreadyDelivered !== undefined
            ? [
                {
                  orderItemId: orderItem.id,
                  _sum: { quantity: overrides.alreadyDelivered },
                },
              ]
            : [],
        ),
      },
      stockMovement: {
        createMany: overrides.movementCreateMany ?? jest.fn(),
      },
      remission: {
        create: jest.fn().mockResolvedValue(overrides.remissionCreate),
      },
    };
  }
  type TxStub = ReturnType<typeof txStub>;

  beforeEach(() => {
    prisma = {
      order: { findUnique: jest.fn() },
      remission: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    inventory = { getStock: jest.fn() };
    audit = { log: jest.fn() };
    service = new RemissionsService(
      prisma as unknown as PrismaService,
      inventory as unknown as InventoryService,
      audit as unknown as AuditService,
    );

    prisma.order.findUnique.mockResolvedValue(order);
    inventory.getStock.mockResolvedValue(new Prisma.Decimal(100));
  });

  describe('create', () => {
    it('throws NotFoundException when the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            orderId: 'missing',
            paymentStatus: 'CARTERA',
            items: [{ orderItemId: orderItem.id, quantity: 1 }],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when an item references a line not in the order', async () => {
      await expect(
        service.create(
          {
            orderId: order.id,
            paymentStatus: 'CARTERA',
            items: [{ orderItemId: 'missing', quantity: 1 }],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects dispatching an order that is not EN_ALMACEN (#80 security review)', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...order,
        status: 'EN_PRODUCCION',
      });

      await expect(
        service.create(
          {
            orderId: order.id,
            paymentStatus: 'CARTERA',
            items: [{ orderItemId: orderItem.id, quantity: 1 }],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('sums duplicate orderItemId entries in the same request before comparing against what remains (#80 security review)', async () => {
      const remissionCreate = jest.fn();
      prisma.$transaction.mockImplementation(
        (callback: (tx: TxStub) => Promise<unknown>) => {
          const tx = txStub({ alreadyDelivered: new Prisma.Decimal(0) });
          tx.remission.create = remissionCreate;
          return callback(tx);
        },
      );

      // Pedido: 10. Ya entregado: 0. Dos líneas de 8 cada una para el mismo
      // orderItemId deberían sumar 16 y exceder lo pedido, no validarse
      // cada una por separado contra el mismo remanente de 10.
      await expect(
        service.create(
          {
            orderId: order.id,
            paymentStatus: 'CARTERA',
            items: [
              { orderItemId: orderItem.id, quantity: 8 },
              { orderItemId: orderItem.id, quantity: 8 },
            ],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(remissionCreate).not.toHaveBeenCalled();
    });

    it('rejects when the requested quantity exceeds what remains to deliver', async () => {
      const remissionCreate = jest.fn();
      prisma.$transaction.mockImplementation(
        (callback: (tx: TxStub) => Promise<unknown>) => {
          const tx = txStub({ alreadyDelivered: new Prisma.Decimal(8) });
          tx.remission.create = remissionCreate;
          return callback(tx);
        },
      );

      // Pedido: 10. Ya entregado: 8. Restante: 2. Se pide: 5 -> excede.
      await expect(
        service.create(
          {
            orderId: order.id,
            paymentStatus: 'CARTERA',
            items: [{ orderItemId: orderItem.id, quantity: 5 }],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(remissionCreate).not.toHaveBeenCalled();
      expect(inventory.getStock).not.toHaveBeenCalled();
    });

    it('rejects when the product does not have enough real stock to dispatch', async () => {
      inventory.getStock.mockResolvedValue(new Prisma.Decimal(1));
      const remissionCreate = jest.fn();
      const movementCreateMany = jest.fn();
      prisma.$transaction.mockImplementation(
        (callback: (tx: TxStub) => Promise<unknown>) => {
          const tx = txStub({
            alreadyDelivered: new Prisma.Decimal(0),
            movementCreateMany,
          });
          tx.remission.create = remissionCreate;
          return callback(tx);
        },
      );

      await expect(
        service.create(
          {
            orderId: order.id,
            paymentStatus: 'CARTERA',
            items: [{ orderItemId: orderItem.id, quantity: 4 }],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(movementCreateMany).not.toHaveBeenCalled();
      expect(remissionCreate).not.toHaveBeenCalled();
    });

    it('writes a SALIDA per product, creates the remission with its payment status, and logs CREATE', async () => {
      const remissionCreate = jest.fn().mockResolvedValue(baseRemission);
      const movementCreateMany = jest.fn();
      prisma.$transaction.mockImplementation(
        (callback: (tx: TxStub) => Promise<unknown>) => {
          const tx = txStub({
            alreadyDelivered: new Prisma.Decimal(0),
            movementCreateMany,
          });
          tx.remission.create = remissionCreate;
          return callback(tx);
        },
      );

      const result = await service.create(
        {
          orderId: order.id,
          paymentStatus: 'ABONADO',
          amountPaid: 50,
          items: [{ orderItemId: orderItem.id, quantity: 4 }],
        },
        'acting-user',
      );

      expect(result).toEqual(baseRemission);
      const movementCalls = movementCreateMany.mock.calls as [
        [
          {
            data: {
              productId: string;
              type: string;
              quantity: Prisma.Decimal;
            }[];
          },
        ],
      ];
      expect(movementCalls[0][0].data).toEqual([
        expect.objectContaining({
          productId: orderItem.productId,
          warehouseId: order.warehouseId,
          type: 'SALIDA',
        }),
      ]);
      expect(movementCalls[0][0].data[0].quantity.toString()).toBe('-4');

      const remissionCreateCalls = remissionCreate.mock.calls as [
        [
          {
            data: {
              orderId: string;
              userId: string;
              paymentStatus: string;
              amountPaid: number;
            };
          },
        ],
      ];
      expect(remissionCreateCalls[0][0].data).toEqual(
        expect.objectContaining({
          orderId: order.id,
          userId: 'acting-user',
          paymentStatus: 'ABONADO',
          amountPaid: 50,
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'Remission',
          userId: 'acting-user',
        }),
      );
    });

    it.each(['P2034', 'P2028'])(
      'converts a %s concurrency error into ConflictException',
      async (code) => {
        prisma.$transaction.mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('conflict', {
            code,
            clientVersion: '6.19.3',
          }),
        );

        await expect(
          service.create(
            {
              orderId: order.id,
              paymentStatus: 'CARTERA',
              items: [{ orderItemId: orderItem.id, quantity: 1 }],
            },
            'acting-user',
          ),
        ).rejects.toBeInstanceOf(ConflictException);
      },
    );
  });

  describe('updatePayment', () => {
    it('throws NotFoundException when the remission does not exist', async () => {
      prisma.remission.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePayment(
          'missing',
          { paymentStatus: 'PAGADO' },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.remission.update).not.toHaveBeenCalled();
    });

    it('updates the payment status/amount and logs UPDATE_PAYMENT', async () => {
      prisma.remission.findUnique.mockResolvedValue(baseRemission);
      prisma.remission.update.mockResolvedValue({
        ...baseRemission,
        paymentStatus: 'PAGADO',
        amountPaid: null,
      });

      const result = await service.updatePayment(
        'remission-1',
        { paymentStatus: 'PAGADO' },
        'acting-user',
      );

      expect(result.paymentStatus).toBe('PAGADO');
      expect(prisma.remission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'remission-1' },
          data: { paymentStatus: 'PAGADO', amountPaid: undefined },
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE_PAYMENT' }),
      );
    });
  });

  it('lists remissions paginated, newest first by default', async () => {
    prisma.remission.findMany.mockResolvedValue([baseRemission]);
    prisma.remission.count.mockResolvedValue(1);

    const result = await service.findAll({});

    expect(result).toEqual({
      data: [baseRemission],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(prisma.remission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('filters by exact number when search is a valid integer', async () => {
    prisma.remission.findMany.mockResolvedValue([baseRemission]);
    prisma.remission.count.mockResolvedValue(1);

    await service.findAll({ search: '42' });

    expect(prisma.remission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { number: 42 } }),
    );
    expect(prisma.remission.count).toHaveBeenCalledWith({
      where: { number: 42 },
    });
  });

  it('returns an empty page instead of ignoring a non-numeric search', async () => {
    prisma.remission.findMany.mockResolvedValue([]);
    prisma.remission.count.mockResolvedValue(0);

    const result = await service.findAll({ search: 'abc' });

    expect(result).toEqual({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    expect(prisma.remission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { number: -1 } }),
    );
  });

  it('throws NotFoundException when findOne cannot find the remission', async () => {
    prisma.remission.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('generates a PDF buffer with the remission number', async () => {
    prisma.remission.findUnique.mockResolvedValue(baseRemission);

    const { buffer, number } = await service.generatePdf('remission-1');

    expect(number).toBe(1);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  describe('voidRemission', () => {
    function voidTxStub(overrides: {
      updateManyCount?: number;
      findUniqueOrThrow?: unknown;
      movementCreateMany?: jest.Mock;
    }) {
      return {
        remission: {
          updateMany: jest
            .fn()
            .mockResolvedValue({ count: overrides.updateManyCount ?? 1 }),
          findUniqueOrThrow: jest
            .fn()
            .mockResolvedValue(overrides.findUniqueOrThrow),
        },
        stockMovement: {
          createMany: overrides.movementCreateMany ?? jest.fn(),
        },
      };
    }

    it('throws NotFoundException when the remission does not exist', async () => {
      prisma.remission.findUnique.mockResolvedValue(null);

      await expect(
        service.voidRemission(
          'missing',
          { reason: 'Error de cantidad' },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the remission is already voided', async () => {
      prisma.remission.findUnique.mockResolvedValue({
        ...baseRemission,
        voidedAt: new Date('2026-01-02'),
      });

      await expect(
        service.voidRemission(
          'remission-1',
          { reason: 'Duplicada' },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the guarded update matches no rows (lost the race)', async () => {
      prisma.remission.findUnique.mockResolvedValue(baseRemission);
      prisma.$transaction.mockImplementation(
        (callback: (tx: unknown) => unknown) =>
          callback(voidTxStub({ updateManyCount: 0 })),
      );

      await expect(
        service.voidRemission(
          'remission-1',
          { reason: 'Error de cantidad' },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('writes one reversing ENTRADA per product and marks the remission voided', async () => {
      prisma.remission.findUnique.mockResolvedValue(baseRemission);
      const movementCreateMany = jest.fn();
      const voidedRemission = {
        ...baseRemission,
        voidedAt: new Date('2026-01-02'),
        voidReason: 'Error de cantidad',
      };
      prisma.$transaction.mockImplementation(
        (callback: (tx: unknown) => unknown) =>
          callback(
            voidTxStub({
              movementCreateMany,
              findUniqueOrThrow: voidedRemission,
            }),
          ),
      );

      const result = await service.voidRemission(
        'remission-1',
        { reason: 'Error de cantidad' },
        'acting-user',
      );

      const movementCalls = movementCreateMany.mock.calls as [
        [
          {
            data: {
              productId: string;
              type: string;
              quantity: Prisma.Decimal;
            }[];
          },
        ],
      ];
      expect(movementCalls[0][0].data).toEqual([
        expect.objectContaining({
          productId: orderItem.productId,
          warehouseId: order.warehouseId,
          type: 'ENTRADA',
          quantity: new Prisma.Decimal(4),
        }),
      ]);
      expect(result.voidedAt).not.toBeNull();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'VOID', entity: 'Remission' }),
      );
    });

    it('excludes voided remissions from "already delivered" when creating a new one', async () => {
      const remissionCreate = jest
        .fn()
        .mockResolvedValue({ id: 'remission-2' });
      const groupBy = jest.fn().mockResolvedValue([]);
      prisma.$transaction.mockImplementation(
        (callback: (tx: TxStub) => unknown) =>
          callback({
            remissionItem: { groupBy },
            stockMovement: { createMany: jest.fn() },
            remission: { create: remissionCreate },
          }),
      );

      await service.create(
        {
          orderId: order.id,
          paymentStatus: 'CARTERA',
          items: [{ orderItemId: orderItem.id, quantity: 4 }],
        },
        'acting-user',
      );

      expect(groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orderItemId: { in: [orderItem.id] },
            remission: { voidedAt: null },
          },
        }),
      );
    });
  });
});
