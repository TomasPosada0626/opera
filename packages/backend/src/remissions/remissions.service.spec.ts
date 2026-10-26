import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paymentStatusFor, RemissionsService } from './remissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';

describe('RemissionsService', () => {
  const orderItem = {
    id: 'order-item-1',
    productId: 'product-1',
    quantity: new Prisma.Decimal(10),
    unitPrice: new Prisma.Decimal(25),
    product: {
      id: 'product-1',
      sku: 'SKU-1',
      name: 'Silla de madera',
      material: 'Roble',
      finish: 'Natural',
      unit: { name: 'Unidad' },
    },
  };
  const order = {
    id: 'order-1',
    number: 12,
    warehouseId: 'warehouse-1',
    status: 'EN_ALMACEN',
    vatRate: new Prisma.Decimal(0),
    items: [orderItem],
  };
  const baseRemission = {
    id: 'remission-1',
    number: 1,
    orderId: order.id,
    userId: 'acting-user',
    subtotal: new Prisma.Decimal(100),
    vatAmount: new Prisma.Decimal(0),
    total: new Prisma.Decimal(100),
    paymentStatus: 'CARTERA',
    amountPaid: new Prisma.Decimal(0),
    createdAt: new Date('2026-01-01'),
    order: {
      number: order.number,
      warehouseId: order.warehouseId,
      vatRate: new Prisma.Decimal(0),
      estimatedDeliveryDate: null,
      customer: {
        name: 'Cliente de prueba',
        taxId: null,
        address: null,
        phone: null,
        city: 'Medellín',
        country: 'Colombia',
        mobile: null,
        zone: null,
        salesRep: null,
        paymentTerms: 'Contado',
      },
      warehouse: { name: 'Bodega principal' },
    },
    user: { id: 'acting-user', name: 'Admin' },
    voidedAt: null,
    voidReason: null,
    payments: [] as { id: string; voidedAt: Date | null }[],
    items: [
      {
        id: 'remission-item-1',
        orderItemId: orderItem.id,
        quantity: new Prisma.Decimal(4),
        orderItem: {
          productId: orderItem.productId,
          unitPrice: orderItem.unitPrice,
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
    };
    $transaction: jest.Mock;
  };
  let inventory: { getStock: jest.Mock };
  let audit: { log: jest.Mock };
  let service: RemissionsService;

  // Mismo espíritu que orders.service.spec.ts: la transacción se mockea
  // ejecutando el callback contra un `tx` falso, no un Postgres real.
  function createTxStub(overrides: {
    alreadyDelivered?: Prisma.Decimal;
    movementCreateMany?: jest.Mock;
    remissionCreate?: jest.Mock;
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
        create:
          overrides.remissionCreate ??
          jest.fn().mockResolvedValue({ id: 'remission-1', number: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(baseRemission),
      },
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
  }
  type CreateTxStub = ReturnType<typeof createTxStub>;

  function runCreateTx(tx: CreateTxStub) {
    prisma.$transaction.mockImplementation(
      (callback: (stub: CreateTxStub) => Promise<unknown>) => callback(tx),
    );
  }

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

  describe('paymentStatusFor', () => {
    it.each([
      [100, 0, 'CARTERA'],
      [100, 40, 'ABONADO'],
      [100, 100, 'PAGADO'],
      [0, 0, 'PAGADO'],
    ])('total %s, abonado %s -> %s', (total, paid, expected) => {
      expect(
        paymentStatusFor(new Prisma.Decimal(total), new Prisma.Decimal(paid)),
      ).toBe(expected);
    });
  });

  describe('create', () => {
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
          {
            orderId: order.id,
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
            items: [{ orderItemId: orderItem.id, quantity: 1 }],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('explains that a DESPACHADO order has nothing left to dispatch', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...order,
        status: 'DESPACHADO',
      });

      await expect(
        service.create(
          {
            orderId: order.id,
            items: [{ orderItemId: orderItem.id, quantity: 1 }],
          },
          'acting-user',
        ),
      ).rejects.toThrow('Este pedido ya se despachó por completo');
    });

    it('rejects an initial payment larger than the remission total before opening a transaction', async () => {
      // 4 x 25 = 100.
      await expect(
        service.create(
          {
            orderId: order.id,
            items: [{ orderItemId: orderItem.id, quantity: 4 }],
            initialPayment: { amount: 150, method: 'EFECTIVO' },
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('sums duplicate orderItemId entries in the same request before comparing against what remains (#80 security review)', async () => {
      const tx = createTxStub({ alreadyDelivered: new Prisma.Decimal(0) });
      runCreateTx(tx);

      // Pedido: 10. Ya entregado: 0. Dos líneas de 8 cada una para el mismo
      // orderItemId deberían sumar 16 y exceder lo pedido, no validarse
      // cada una por separado contra el mismo remanente de 10.
      await expect(
        service.create(
          {
            orderId: order.id,
            items: [
              { orderItemId: orderItem.id, quantity: 8 },
              { orderItemId: orderItem.id, quantity: 8 },
            ],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.remission.create).not.toHaveBeenCalled();
    });

    it('rejects when the requested quantity exceeds what remains to deliver', async () => {
      const tx = createTxStub({ alreadyDelivered: new Prisma.Decimal(8) });
      runCreateTx(tx);

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
      expect(tx.remission.create).not.toHaveBeenCalled();
      expect(inventory.getStock).not.toHaveBeenCalled();
    });

    it('rejects when the product does not have enough real stock to dispatch', async () => {
      inventory.getStock.mockResolvedValue(new Prisma.Decimal(1));
      const tx = createTxStub({ alreadyDelivered: new Prisma.Decimal(0) });
      runCreateTx(tx);

      await expect(
        service.create(
          {
            orderId: order.id,
            items: [{ orderItemId: orderItem.id, quantity: 4 }],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.stockMovement.createMany).not.toHaveBeenCalled();
      expect(tx.remission.create).not.toHaveBeenCalled();
    });

    it('creates the remission with its total in CARTERA, writes the SALIDA citing its number, and logs CREATE', async () => {
      const tx = createTxStub({ alreadyDelivered: new Prisma.Decimal(0) });
      tx.remission.create.mockResolvedValue({ id: 'remission-9', number: 9 });
      runCreateTx(tx);

      const result = await service.create(
        {
          orderId: order.id,
          items: [{ orderItemId: orderItem.id, quantity: 4 }],
        },
        'acting-user',
      );

      expect(result).toEqual(baseRemission);
      const createCalls = tx.remission.create.mock.calls as [
        [
          {
            data: {
              total: Prisma.Decimal;
              amountPaid: Prisma.Decimal;
              paymentStatus: string;
              payments?: unknown;
            };
          },
        ],
      ];
      expect(createCalls[0][0].data.total.toString()).toBe('100');
      expect(createCalls[0][0].data.amountPaid.toString()).toBe('0');
      expect(createCalls[0][0].data.paymentStatus).toBe('CARTERA');
      expect(createCalls[0][0].data.payments).toBeUndefined();

      const movementCalls = tx.stockMovement.createMany.mock.calls as [
        [
          {
            data: {
              productId: string;
              type: string;
              quantity: Prisma.Decimal;
              reason: string;
            }[];
          },
        ],
      ];
      expect(movementCalls[0][0].data).toEqual([
        expect.objectContaining({
          productId: orderItem.productId,
          warehouseId: order.warehouseId,
          type: 'SALIDA',
          reason: 'Despacho, remisión HT 9 del pedido No. 12',
        }),
      ]);
      expect(movementCalls[0][0].data[0].quantity.toString()).toBe('-4');
      // 4 de 10: despacho parcial, el pedido sigue EN_ALMACEN.
      expect(tx.order.updateMany).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'Remission',
          userId: 'acting-user',
        }),
      );
    });

    // Lo que el cliente debe (cartera, abonos) es el total con IVA: un
    // pago de 100 sobre una remisión de 100 + 19 % no la deja saldada.
    it('adds the order VAT to the total the customer owes, keeping subtotal and VAT apart', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...order,
        vatRate: new Prisma.Decimal(19),
      });
      const tx = createTxStub({ alreadyDelivered: new Prisma.Decimal(0) });
      runCreateTx(tx);

      await service.create(
        {
          orderId: order.id,
          items: [{ orderItemId: orderItem.id, quantity: 4 }],
          initialPayment: {
            amount: 100,
            method: 'EFECTIVO',
            paidAt: '2026-10-26T12:00:00.000Z',
          },
        },
        'acting-user',
      );

      const createCalls = tx.remission.create.mock.calls as [
        [
          {
            data: {
              subtotal: Prisma.Decimal;
              vatAmount: Prisma.Decimal;
              total: Prisma.Decimal;
              paymentStatus: string;
            };
          },
        ],
      ];
      const { data } = createCalls[0][0];
      expect(data.subtotal.toString()).toBe('100');
      expect(data.vatAmount.toString()).toBe('19');
      expect(data.total.toString()).toBe('119');
      expect(data.paymentStatus).toBe('ABONADO');
    });

    it.each([
      [40, 'ABONADO'],
      [100, 'PAGADO'],
    ])(
      'records an initial payment of %s as the first abono (%s)',
      async (amount, status) => {
        const tx = createTxStub({ alreadyDelivered: new Prisma.Decimal(0) });
        runCreateTx(tx);

        await service.create(
          {
            orderId: order.id,
            items: [{ orderItemId: orderItem.id, quantity: 4 }],
            initialPayment: {
              amount,
              method: 'TRANSFERENCIA',
              paidAt: '2026-10-20T15:00:00.000Z',
              note: '  Nequi  ',
            },
          },
          'acting-user',
        );

        const createCalls = tx.remission.create.mock.calls as [
          [
            {
              data: {
                amountPaid: Prisma.Decimal;
                paymentStatus: string;
                payments: {
                  create: {
                    amount: number;
                    method: string;
                    paidAt: Date;
                    note: string;
                  };
                };
              };
            },
          ],
        ];
        const { data } = createCalls[0][0];
        expect(data.amountPaid.toString()).toBe(String(amount));
        expect(data.paymentStatus).toBe(status);
        expect(data.payments.create).toEqual(
          expect.objectContaining({
            amount,
            method: 'TRANSFERENCIA',
            note: 'Nequi',
            userId: 'acting-user',
          }),
        );
        expect(data.payments.create.paidAt.toISOString()).toBe(
          '2026-10-20T15:00:00.000Z',
        );
      },
    );

    it('marks the order DESPACHADO when this remission completes every line', async () => {
      const tx = createTxStub({ alreadyDelivered: new Prisma.Decimal(6) });
      runCreateTx(tx);

      await service.create(
        {
          orderId: order.id,
          items: [{ orderItemId: orderItem.id, quantity: 4 }],
        },
        'acting-user',
      );

      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: order.id, status: 'EN_ALMACEN' },
        data: { status: 'DESPACHADO', dispatchedAt: expect.any(Date) as Date },
      });
    });

    it('excludes voided remissions from "already delivered", across every line of the order', async () => {
      const tx = createTxStub({});
      runCreateTx(tx);

      await service.create(
        {
          orderId: order.id,
          items: [{ orderItemId: orderItem.id, quantity: 4 }],
        },
        'acting-user',
      );

      expect(tx.remissionItem.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orderItemId: { in: [orderItem.id] },
            remission: { voidedAt: null },
          },
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
  });

  describe('addPayment', () => {
    function paymentTxStub(current: unknown) {
      return {
        remission: {
          findUnique: jest.fn().mockResolvedValue(current),
          update: jest
            .fn()
            .mockImplementation(
              ({
                data,
              }: {
                data: { amountPaid: Prisma.Decimal; paymentStatus: string };
              }) => Promise.resolve({ ...baseRemission, ...data }),
            ),
        },
        remissionPayment: {
          create: jest.fn().mockResolvedValue({
            id: 'payment-1',
            amount: new Prisma.Decimal(30),
            method: 'EFECTIVO',
            paidAt: new Date('2026-10-24'),
          }),
        },
      };
    }
    type PaymentTxStub = ReturnType<typeof paymentTxStub>;

    function runPaymentTx(tx: PaymentTxStub) {
      prisma.$transaction.mockImplementation(
        (callback: (stub: PaymentTxStub) => Promise<unknown>) => callback(tx),
      );
    }

    it('throws NotFoundException when the remission does not exist', async () => {
      runPaymentTx(paymentTxStub(null));

      await expect(
        service.addPayment(
          'missing',
          { amount: 10, method: 'EFECTIVO' },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects payments on a voided remission', async () => {
      const tx = paymentTxStub({
        ...baseRemission,
        voidedAt: new Date('2026-01-02'),
      });
      runPaymentTx(tx);

      await expect(
        service.addPayment(
          'remission-1',
          { amount: 10, method: 'EFECTIVO' },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.remissionPayment.create).not.toHaveBeenCalled();
    });

    it('rejects a payment larger than the pending balance', async () => {
      const tx = paymentTxStub({
        ...baseRemission,
        amountPaid: new Prisma.Decimal(80),
      });
      runPaymentTx(tx);

      await expect(
        service.addPayment(
          'remission-1',
          { amount: 30, method: 'EFECTIVO' },
          'acting-user',
        ),
      ).rejects.toThrow('supera el saldo pendiente');
      expect(tx.remissionPayment.create).not.toHaveBeenCalled();
    });

    it('says the remission is already paid when nothing is pending', async () => {
      runPaymentTx(
        paymentTxStub({
          ...baseRemission,
          amountPaid: new Prisma.Decimal(100),
          paymentStatus: 'PAGADO',
        }),
      );

      await expect(
        service.addPayment(
          'remission-1',
          { amount: 1, method: 'EFECTIVO' },
          'acting-user',
        ),
      ).rejects.toThrow('ya está pagada por completo');
    });

    it('creates the payment, bumps amountPaid, recomputes the status, and logs ADD_PAYMENT', async () => {
      const tx = paymentTxStub({
        ...baseRemission,
        amountPaid: new Prisma.Decimal(70),
      });
      runPaymentTx(tx);

      const result = await service.addPayment(
        'remission-1',
        { amount: 30, method: 'EFECTIVO', note: ' ' },
        'acting-user',
      );

      expect(tx.remissionPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          remissionId: 'remission-1',
          amount: 30,
          method: 'EFECTIVO',
          note: undefined,
          userId: 'acting-user',
        }) as object,
      });
      expect(result.paymentStatus).toBe('PAGADO');
      expect(result.amountPaid.toString()).toBe('100');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADD_PAYMENT', entity: 'Remission' }),
      );
    });

    it('converts a serialization conflict into ConflictException', async () => {
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2034',
          clientVersion: '6.19.3',
        }),
      );

      await expect(
        service.addPayment(
          'remission-1',
          { amount: 10, method: 'EFECTIVO' },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('voidPayment', () => {
    function voidPaymentTxStub(overrides: {
      updateManyCount: number;
      existing?: unknown;
      remainingSum?: Prisma.Decimal | null;
    }) {
      return {
        remissionPayment: {
          updateMany: jest
            .fn()
            .mockResolvedValue({ count: overrides.updateManyCount }),
          findFirst: jest.fn().mockResolvedValue(overrides.existing ?? null),
          aggregate: jest.fn().mockResolvedValue({
            _sum: { amount: overrides.remainingSum ?? null },
          }),
        },
        remission: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(baseRemission),
          update: jest
            .fn()
            .mockImplementation(
              ({
                data,
              }: {
                data: { amountPaid: Prisma.Decimal; paymentStatus: string };
              }) => Promise.resolve({ ...baseRemission, ...data }),
            ),
        },
      };
    }

    it('throws NotFoundException when the payment does not belong to the remission', async () => {
      prisma.$transaction.mockImplementation(
        (callback: (tx: unknown) => unknown) =>
          callback(voidPaymentTxStub({ updateManyCount: 0 })),
      );

      await expect(
        service.voidPayment(
          'remission-1',
          'payment-x',
          { reason: 'Error' },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when the payment is already voided', async () => {
      prisma.$transaction.mockImplementation(
        (callback: (tx: unknown) => unknown) =>
          callback(
            voidPaymentTxStub({
              updateManyCount: 0,
              existing: { id: 'payment-1' },
            }),
          ),
      );

      await expect(
        service.voidPayment(
          'remission-1',
          'payment-1',
          { reason: 'Error' },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recomputes amountPaid from the remaining payments and logs VOID_PAYMENT', async () => {
      const tx = voidPaymentTxStub({
        updateManyCount: 1,
        remainingSum: new Prisma.Decimal(25),
      });
      prisma.$transaction.mockImplementation(
        (callback: (stub: unknown) => unknown) => callback(tx),
      );

      const result = await service.voidPayment(
        'remission-1',
        'payment-1',
        { reason: 'Cheque devuelto' },
        'acting-user',
      );

      expect(tx.remissionPayment.updateMany).toHaveBeenCalledWith({
        where: { id: 'payment-1', remissionId: 'remission-1', voidedAt: null },
        data: {
          voidedAt: expect.any(Date) as Date,
          voidReason: 'Cheque devuelto',
        },
      });
      expect(result.amountPaid.toString()).toBe('25');
      expect(result.paymentStatus).toBe('ABONADO');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'VOID_PAYMENT' }),
      );
    });

    it('falls back to CARTERA when no valid payment remains', async () => {
      const tx = voidPaymentTxStub({ updateManyCount: 1, remainingSum: null });
      prisma.$transaction.mockImplementation(
        (callback: (stub: unknown) => unknown) => callback(tx),
      );

      const result = await service.voidPayment(
        'remission-1',
        'payment-1',
        { reason: 'Duplicado' },
        'acting-user',
      );

      expect(result.amountPaid.toString()).toBe('0');
      expect(result.paymentStatus).toBe('CARTERA');
    });
  });

  describe('findAll / findOne / PDF', () => {
    it('lists remissions paginated, newest first by default', async () => {
      prisma.remission.findMany.mockResolvedValue([baseRemission]);
      prisma.remission.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result).toEqual({
        data: [baseRemission],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });
      expect(prisma.remission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: undefined,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('filters by exact number when search is a valid integer', async () => {
      prisma.remission.findMany.mockResolvedValue([baseRemission]);
      prisma.remission.count.mockResolvedValue(1);

      await service.findAll({ search: '42' });

      expect(prisma.remission.count).toHaveBeenCalledWith({
        where: { number: 42 },
      });
    });

    it('also finds a remission by its printed number ("HT 3285")', async () => {
      prisma.remission.findMany.mockResolvedValue([baseRemission]);
      prisma.remission.count.mockResolvedValue(1);

      await service.findAll({ search: 'HT 3285' });

      expect(prisma.remission.count).toHaveBeenCalledWith({
        where: { number: 3285 },
      });
    });

    it('returns an empty page instead of ignoring a non-numeric search', async () => {
      prisma.remission.findMany.mockResolvedValue([]);
      prisma.remission.count.mockResolvedValue(0);

      await service.findAll({ search: 'abc' });

      expect(prisma.remission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { number: -1 } }),
      );
    });

    it('filters by payment status (only non-voided) and by customer', async () => {
      prisma.remission.findMany.mockResolvedValue([]);
      prisma.remission.count.mockResolvedValue(0);

      await service.findAll({
        paymentStatus: 'CARTERA',
        customerId: 'customer-1',
      });

      expect(prisma.remission.count).toHaveBeenCalledWith({
        where: {
          paymentStatus: 'CARTERA',
          voidedAt: null,
          order: { customerId: 'customer-1' },
        },
      });
    });

    it('throws NotFoundException when findOne cannot find the remission', async () => {
      prisma.remission.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    // Los objetos /Page del PDF no van comprimidos (el contenido de cada
    // página sí): contarlos dice en cuántas hojas salió.
    function pageCount(buffer: Buffer): number {
      return (
        buffer.toString('latin1').match(/\/Type \/Page\b(?!s)/g)?.length ?? 0
      );
    }

    it('generates a PDF buffer with the remission number', async () => {
      prisma.remission.findUnique.mockResolvedValue(baseRemission);

      const { buffer, number } = await service.generatePdf('remission-1');

      expect(number).toBe(1);
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    // Herrajes Toro imprime una hoja por remisión y la corta por la mitad:
    // copia del cliente arriba, de la empresa abajo.
    it('puts both copies on a single letter page when the lines fit in half', async () => {
      prisma.remission.findUnique.mockResolvedValue(baseRemission);

      const { buffer } = await service.generatePdf('remission-1');

      expect(pageCount(buffer)).toBe(1);
    });

    it('gives each copy its own page when the lines do not fit in half a page', async () => {
      prisma.remission.findUnique.mockResolvedValue({
        ...baseRemission,
        items: Array.from({ length: 30 }, (_, index) => ({
          ...baseRemission.items[0],
          id: `remission-item-${index}`,
        })),
      });

      const { buffer } = await service.generatePdf('remission-1');

      expect(pageCount(buffer)).toBe(2);
    });

    it('continues a copy on another page instead of cutting lines off', async () => {
      prisma.remission.findUnique.mockResolvedValue({
        ...baseRemission,
        items: Array.from({ length: 90 }, (_, index) => ({
          ...baseRemission.items[0],
          id: `remission-item-${index}`,
        })),
      });

      const { buffer } = await service.generatePdf('remission-1');

      expect(pageCount(buffer)).toBeGreaterThanOrEqual(4);
    });
  });

  describe('voidRemission', () => {
    function voidTxStub(overrides: {
      updateManyCount?: number;
      findUniqueOrThrow?: unknown;
      movementCreateMany?: jest.Mock;
      orderUpdateMany?: jest.Mock;
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
        order: {
          updateMany:
            overrides.orderUpdateMany ??
            jest.fn().mockResolvedValue({ count: 0 }),
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

    it('refuses to void a remission with valid payments, so the customer balance never jumps up', async () => {
      prisma.remission.findUnique.mockResolvedValue({
        ...baseRemission,
        payments: [{ id: 'payment-1', voidedAt: null }],
      });

      await expect(
        service.voidRemission(
          'remission-1',
          { reason: 'Error de cantidad' },
          'acting-user',
        ),
      ).rejects.toThrow('tiene abonos registrados');
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

    it('writes one reversing ENTRADA per product, sends a DESPACHADO order back to EN_ALMACEN, and marks the remission voided', async () => {
      prisma.remission.findUnique.mockResolvedValue({
        ...baseRemission,
        payments: [{ id: 'payment-1', voidedAt: new Date('2026-01-02') }],
      });
      const movementCreateMany = jest.fn();
      const orderUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
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
              orderUpdateMany,
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
      expect(orderUpdateMany).toHaveBeenCalledWith({
        where: { id: order.id, status: 'DESPACHADO' },
        data: { status: 'EN_ALMACEN', dispatchedAt: null },
      });
      expect(result.voidedAt).not.toBeNull();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'VOID', entity: 'Remission' }),
      );
    });
  });
});
