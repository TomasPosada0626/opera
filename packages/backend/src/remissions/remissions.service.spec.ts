import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RemissionsService } from './remissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('RemissionsService', () => {
  const orderItem = {
    id: 'order-item-1',
    quantity: new Prisma.Decimal(10),
    product: { id: 'product-1', name: 'Silla de madera' },
  };
  const order = { id: 'order-1', items: [orderItem] };
  const baseRemission = {
    id: 'remission-1',
    number: 1,
    orderId: order.id,
    userId: 'acting-user',
    createdAt: new Date('2026-01-01'),
    order: {
      customer: { name: 'Cliente de prueba' },
      warehouse: { name: 'Bodega principal' },
    },
    user: { id: 'acting-user', name: 'Admin' },
    items: [
      {
        id: 'remission-item-1',
        orderItemId: orderItem.id,
        quantity: new Prisma.Decimal(4),
        orderItem: { product: orderItem.product },
      },
    ],
  };

  let prisma: {
    order: { findUnique: jest.Mock };
    remission: { count: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let service: RemissionsService;

  // Mismo espíritu que orders.service.spec.ts: la transacción se mockea
  // ejecutando el callback contra un `tx` falso, no un Postgres real.
  function txStub(overrides: {
    alreadyDelivered?: Prisma.Decimal;
    remissionCreate?: unknown;
  }) {
    return {
      remissionItem: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { quantity: overrides.alreadyDelivered ?? null },
        }),
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
      },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };
    service = new RemissionsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );

    prisma.order.findUnique.mockResolvedValue(order);
  });

  it('throws NotFoundException when the order does not exist', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(
      service.create(
        {
          orderId: 'missing',
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
        { orderId: order.id, items: [{ orderItemId: 'missing', quantity: 1 }] },
        'acting-user',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
          items: [{ orderItemId: orderItem.id, quantity: 5 }],
        },
        'acting-user',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(remissionCreate).not.toHaveBeenCalled();
  });

  it('creates the remission and logs a CREATE audit entry when quantity is within what remains', async () => {
    const remissionCreate = jest.fn().mockResolvedValue(baseRemission);
    prisma.$transaction.mockImplementation(
      (callback: (tx: TxStub) => Promise<unknown>) => {
        const tx = txStub({
          alreadyDelivered: new Prisma.Decimal(0),
          remissionCreate: baseRemission,
        });
        tx.remission.create = remissionCreate;
        return callback(tx);
      },
    );

    const result = await service.create(
      {
        orderId: order.id,
        items: [{ orderItemId: orderItem.id, quantity: 4 }],
      },
      'acting-user',
    );

    expect(result).toEqual(baseRemission);
    const remissionCreateCalls = remissionCreate.mock.calls as [
      [{ data: { orderId: string; userId: string } }],
    ];
    expect(remissionCreateCalls[0][0].data).toEqual(
      expect.objectContaining({
        orderId: order.id,
        userId: 'acting-user',
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
            items: [{ orderItemId: orderItem.id, quantity: 1 }],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );

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
});
