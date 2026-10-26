import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersService, overdueWhere, todayAsDateOnly } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';

describe('OrdersService', () => {
  const customer = {
    id: 'customer-1',
    name: 'Cliente de prueba',
    isActive: true,
  };
  const warehouse = {
    id: 'warehouse-1',
    name: 'Bodega principal',
    isActive: true,
  };
  const product = {
    id: 'product-1',
    name: 'Silla de madera',
    isActive: true,
  };
  const baseOrder = {
    id: 'order-1',
    number: 7,
    customerId: customer.id,
    warehouseId: warehouse.id,
    userId: 'acting-user',
    status: 'PENDIENTE',
    items: [
      { id: 'item-1', productId: product.id, quantity: '2', unitPrice: '50' },
    ],
    remissions: [],
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
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let inventory: {
    getStockForProducts: jest.Mock;
    getAverageCostForProducts: jest.Mock;
  };
  let service: OrdersService;

  // La transacción de markWarehoused se mockea ejecutando el callback
  // contra un `tx` falso — mismo espíritu que el resto de specs de este
  // proyecto, no hace falta Postgres real para probar la lógica.
  function txStub(overrides: {
    orderUpdateMany?: unknown;
    orderFindUniqueOrThrow?: unknown;
    movementCreateMany?: jest.Mock;
    boms?: unknown[];
  }) {
    return {
      billOfMaterials: {
        findMany: jest.fn().mockResolvedValue(overrides.boms ?? []),
      },
      order: {
        updateMany: jest
          .fn()
          .mockResolvedValue(overrides.orderUpdateMany ?? { count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue(overrides.orderFindUniqueOrThrow),
      },
      stockMovement: {
        createMany: overrides.movementCreateMany ?? jest.fn(),
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
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };
    inventory = {
      getStockForProducts: jest.fn().mockResolvedValue([]),
      getAverageCostForProducts: jest.fn().mockResolvedValue(new Map()),
    };
    service = new OrdersService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      inventory as unknown as InventoryService,
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

    it('throws BadRequestException when the customer is deactivated', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        ...customer,
        isActive: false,
      });

      await expect(
        service.create(
          {
            customerId: customer.id,
            warehouseId: warehouse.id,
            items: [{ productId: product.id, quantity: 1, unitPrice: 10 }],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the warehouse is deactivated', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        ...warehouse,
        isActive: false,
      });

      await expect(
        service.create(
          {
            customerId: customer.id,
            warehouseId: warehouse.id,
            items: [{ productId: product.id, quantity: 1, unitPrice: 10 }],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when an item references a deactivated product', async () => {
      prisma.product.findMany.mockResolvedValue([
        { ...product, isActive: false },
      ]);

      await expect(
        service.create(
          {
            customerId: customer.id,
            warehouseId: warehouse.id,
            items: [{ productId: product.id, quantity: 1, unitPrice: 10 }],
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
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
          // Sin vatRate en la petición: sin IVA.
          vatRate: 0,
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

  describe('create (IVA)', () => {
    it('stores the VAT rate chosen for the order', async () => {
      prisma.order.create.mockResolvedValue(baseOrder);

      await service.create(
        {
          customerId: customer.id,
          warehouseId: warehouse.id,
          items: [{ productId: product.id, quantity: 2, unitPrice: 50 }],
          vatRate: 19,
        },
        'acting-user',
      );

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ vatRate: 19 }) as unknown,
        }),
      );
    });
  });

  describe('create (seguimiento)', () => {
    it('stores the estimated delivery date as a date-only value and trims notes', async () => {
      prisma.order.create.mockResolvedValue(baseOrder);

      await service.create(
        {
          customerId: customer.id,
          warehouseId: warehouse.id,
          items: [{ productId: product.id, quantity: 2, unitPrice: 50 }],
          estimatedDeliveryDate: '2026-11-15',
          notes: '  Entregar en la obra  ',
        },
        'acting-user',
      );

      const createCalls = prisma.order.create.mock.calls as [
        [{ data: { estimatedDeliveryDate: Date; notes: string } }],
      ];
      expect(createCalls[0][0].data.estimatedDeliveryDate.toISOString()).toBe(
        '2026-11-15T00:00:00.000Z',
      );
      expect(createCalls[0][0].data.notes).toBe('Entregar en la obra');
    });

    it('omits the estimated date and blank notes when not given', async () => {
      prisma.order.create.mockResolvedValue(baseOrder);

      await service.create(
        {
          customerId: customer.id,
          warehouseId: warehouse.id,
          items: [{ productId: product.id, quantity: 2, unitPrice: 50 }],
          notes: '   ',
        },
        'acting-user',
      );

      const createCalls = prisma.order.create.mock.calls as [
        [{ data: { estimatedDeliveryDate?: Date; notes?: string } }],
      ];
      expect(createCalls[0][0].data.estimatedDeliveryDate).toBeUndefined();
      expect(createCalls[0][0].data.notes).toBeUndefined();
    });
  });

  describe('update', () => {
    it('rejects editing a cancelled order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: 'CANCELADO',
      });

      await expect(
        service.update('order-1', { notes: 'x' }, 'acting-user'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('sets a new date, clears notes with null, and logs before/after', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        estimatedDeliveryDate: null,
        notes: 'vieja',
      });
      prisma.order.update.mockResolvedValue({
        ...baseOrder,
        estimatedDeliveryDate: new Date('2026-12-01'),
        notes: null,
      });

      await service.update(
        'order-1',
        { estimatedDeliveryDate: '2026-12-01', notes: null },
        'acting-user',
      );

      const updateCalls = prisma.order.update.mock.calls as [
        [{ data: { estimatedDeliveryDate: Date; notes: null } }],
      ];
      expect(updateCalls[0][0].data.estimatedDeliveryDate.toISOString()).toBe(
        '2026-12-01T00:00:00.000Z',
      );
      expect(updateCalls[0][0].data.notes).toBeNull();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          before: { estimatedDeliveryDate: null, notes: 'vieja' },
        }),
      );
    });

    // No todas las ventas llevan IVA: se elige por pedido y se puede
    // corregir mientras no haya remisiones que ya lo usaron.
    it('changes the VAT while the order has no active remissions', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        vatRate: new Prisma.Decimal(0),
        remissions: [{ id: 'remission-1', voidedAt: new Date() }],
      });
      prisma.order.update.mockResolvedValue(baseOrder);

      await service.update('order-1', { vatRate: 19 }, 'acting-user');

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { vatRate: 19 } }),
      );
    });

    it('refuses to change the VAT once an active remission used it', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        vatRate: new Prisma.Decimal(0),
        remissions: [{ id: 'remission-1', voidedAt: null }],
      });

      await expect(
        service.update('order-1', { vatRate: 19 }, 'acting-user'),
      ).rejects.toThrow('El IVA no se puede cambiar');
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('lets the same VAT through even with remissions (nothing changes)', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        vatRate: new Prisma.Decimal(19),
        remissions: [{ id: 'remission-1', voidedAt: null }],
      });
      prisma.order.update.mockResolvedValue(baseOrder);

      await service.update(
        'order-1',
        { vatRate: 19, notes: 'llamar antes' },
        'acting-user',
      );

      expect(prisma.order.update).toHaveBeenCalled();
    });

    it('clears the date with null and leaves untouched fields out of the update', async () => {
      prisma.order.findUnique.mockResolvedValue(baseOrder);
      prisma.order.update.mockResolvedValue(baseOrder);

      await service.update(
        'order-1',
        { estimatedDeliveryDate: null },
        'acting-user',
      );

      const updateCalls = prisma.order.update.mock.calls as [
        [{ data: Record<string, unknown> }],
      ];
      expect(updateCalls[0][0].data).toEqual({ estimatedDeliveryDate: null });
    });
  });

  describe('overdueWhere / todayAsDateOnly', () => {
    it('builds today as UTC midnight of the local calendar day', () => {
      const today = todayAsDateOnly(new Date(2026, 9, 24, 23, 30));
      expect(today.toISOString()).toBe('2026-10-24T00:00:00.000Z');
    });

    it('only counts orders still in progress whose date is before today', () => {
      expect(overdueWhere(new Date(2026, 9, 24, 8))).toEqual({
        estimatedDeliveryDate: { lt: new Date('2026-10-24T00:00:00.000Z') },
        status: { in: ['PENDIENTE', 'EN_PRODUCCION', 'EN_ALMACEN'] },
      });
    });
  });

  describe('findAll / findOne', () => {
    it('filters overdue orders inside AND so it combines with ?status=', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.findAll({ status: 'EN_ALMACEN', overdue: true });

      const countCalls = prisma.order.count.mock.calls as [
        [{ where: { status: string; AND: unknown[] } }],
      ];
      expect(countCalls[0][0].where.status).toBe('EN_ALMACEN');
      expect(countCalls[0][0].where.AND).toHaveLength(1);
    });

    it('searches by exact order number, and returns nothing for non-numeric text', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.findAll({ search: '45' });
      await service.findAll({ search: 'abc' });

      expect(prisma.order.count).toHaveBeenNthCalledWith(1, {
        where: { number: 45 },
      });
      expect(prisma.order.count).toHaveBeenNthCalledWith(2, {
        where: { number: -1 },
      });
    });

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

      expect(prisma.order.count).toHaveBeenCalledWith({ where: {} });
    });

    it('filters by customerId when provided', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.findAll({ customerId: customer.id });

      expect(prisma.order.count).toHaveBeenCalledWith({
        where: { customerId: customer.id },
      });
    });

    it('combines status and customerId filters when both are provided', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.findAll({
        status: 'EN_ALMACEN',
        customerId: customer.id,
      });

      expect(prisma.order.count).toHaveBeenCalledWith({
        where: { status: 'EN_ALMACEN', customerId: customer.id },
      });
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
      const movementCreateMany = jest.fn();
      const orderUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const orderFindUniqueOrThrow = jest.fn().mockResolvedValue({
        ...baseOrder,
        status: 'EN_ALMACEN',
        warehousedAt: new Date('2026-01-02'),
      });
      prisma.$transaction.mockImplementation(
        (callback: (tx: TxStub) => Promise<unknown>) => {
          const tx = txStub({ movementCreateMany });
          tx.order.updateMany = orderUpdateMany;
          tx.order.findUniqueOrThrow = orderFindUniqueOrThrow;
          return callback(tx);
        },
      );

      const result = await service.markWarehoused('order-1', 'acting-user');

      expect(result.status).toBe('EN_ALMACEN');
      const movementCalls = movementCreateMany.mock.calls as [
        [
          {
            data: { productId: string; type: string; quantity: string }[];
          },
        ],
      ];
      expect(movementCalls[0][0].data).toEqual([
        expect.objectContaining({
          productId: product.id,
          type: 'ENTRADA',
          quantity: '2',
        }),
      ]);
      const orderUpdateManyCalls = orderUpdateMany.mock.calls as [
        [{ where: { status: string }; data: { status: string } }],
      ];
      expect(orderUpdateManyCalls[0][0].where.status).toBe('EN_PRODUCCION');
      expect(orderUpdateManyCalls[0][0].data.status).toBe('EN_ALMACEN');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MARK_WAREHOUSED' }),
      );
    });

    it('consumes the bill of materials and enters the finished good at its cost', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: 'EN_PRODUCCION',
        items: [
          {
            id: 'item-1',
            productId: product.id,
            quantity: new Prisma.Decimal(2),
            unitPrice: new Prisma.Decimal(50),
          },
        ],
      });
      const movementCreateMany = jest.fn();
      inventory.getStockForProducts.mockResolvedValue([
        { productId: 'wood', stock: new Prisma.Decimal(10) },
        { productId: 'screw', stock: new Prisma.Decimal(100) },
      ]);
      inventory.getAverageCostForProducts.mockResolvedValue(
        new Map([
          ['wood', new Prisma.Decimal(4)],
          ['screw', new Prisma.Decimal(0.5)],
        ]),
      );
      prisma.$transaction.mockImplementation(
        (callback: (tx: TxStub) => Promise<unknown>) =>
          callback(
            txStub({
              movementCreateMany,
              orderFindUniqueOrThrow: { ...baseOrder, status: 'EN_ALMACEN' },
              boms: [
                {
                  productId: product.id,
                  items: [
                    {
                      componentId: 'wood',
                      quantity: new Prisma.Decimal(3),
                      component: { name: 'Tabla' },
                    },
                    {
                      componentId: 'screw',
                      quantity: new Prisma.Decimal(8),
                      component: { name: 'Tornillo' },
                    },
                  ],
                },
              ],
            }),
          ),
      );

      await service.markWarehoused('order-1', 'acting-user');

      const calls = movementCreateMany.mock.calls as Array<
        [
          {
            data: {
              productId: string;
              type: string;
              quantity: Prisma.Decimal;
              unitCost?: Prisma.Decimal;
              reason: string;
            }[];
          },
        ]
      >;
      // Primero las SALIDA de materiales (2 sillas x 3 tablas, 2 x 8 tornillos).
      const consumption = calls[0][0].data;
      expect(consumption.map((row) => [row.productId, row.type])).toEqual([
        ['wood', 'SALIDA'],
        ['screw', 'SALIDA'],
      ]);
      expect(consumption[0].quantity.toString()).toBe('-6');
      expect(consumption[1].quantity.toString()).toBe('-16');
      expect(consumption[0].reason).toBe('Consumo de materiales, pedido No. 7');
      // Después la ENTRADA del terminado: 3 x 4 + 8 x 0.5 = 16 por unidad.
      const entry = calls[1][0].data[0];
      expect(entry.type).toBe('ENTRADA');
      expect(entry.unitCost?.toString()).toBe('16');
      expect(entry.reason).toBe('Producción terminada, pedido No. 7');
    });

    it('rejects with the shortage detail when a material is missing, writing nothing', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: 'EN_PRODUCCION',
        items: [
          {
            id: 'item-1',
            productId: product.id,
            quantity: new Prisma.Decimal(2),
            unitPrice: new Prisma.Decimal(50),
          },
        ],
      });
      const movementCreateMany = jest.fn();
      inventory.getStockForProducts.mockResolvedValue([
        { productId: 'wood', stock: new Prisma.Decimal(5) },
      ]);
      prisma.$transaction.mockImplementation(
        (callback: (tx: TxStub) => Promise<unknown>) =>
          callback(
            txStub({
              movementCreateMany,
              boms: [
                {
                  productId: product.id,
                  items: [
                    {
                      componentId: 'wood',
                      quantity: new Prisma.Decimal(3),
                      component: { name: 'Tabla' },
                    },
                  ],
                },
              ],
            }),
          ),
      );

      const error = (await service
        .markWarehoused('order-1', 'acting-user')
        .catch((caught: unknown) => caught)) as BadRequestException;

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({
          shortages: [
            {
              componentId: 'wood',
              componentName: 'Tabla',
              required: '6',
              available: '5',
            },
          ],
        }),
      );
      expect(movementCreateMany).not.toHaveBeenCalled();
    });

    it('ignores a bill of materials with no lines', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: 'EN_PRODUCCION',
      });
      const movementCreateMany = jest.fn();
      prisma.$transaction.mockImplementation(
        (callback: (tx: TxStub) => Promise<unknown>) =>
          callback(
            txStub({
              movementCreateMany,
              orderFindUniqueOrThrow: { ...baseOrder, status: 'EN_ALMACEN' },
              boms: [{ productId: product.id, items: [] }],
            }),
          ),
      );

      await service.markWarehoused('order-1', 'acting-user');

      expect(movementCreateMany).toHaveBeenCalledTimes(1);
      expect(inventory.getStockForProducts).not.toHaveBeenCalled();
    });

    it('converts an atomic guard miss (count 0) into ConflictException', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: 'EN_PRODUCCION',
      });
      prisma.$transaction.mockImplementation(
        (callback: (tx: TxStub) => Promise<unknown>) => {
          const tx = txStub({ orderUpdateMany: { count: 0 } });
          return callback(tx);
        },
      );

      await expect(
        service.markWarehoused('order-1', 'acting-user'),
      ).rejects.toBeInstanceOf(ConflictException);
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

  describe('cancel', () => {
    it('throws NotFoundException when the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.cancel('missing', 'acting-user'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the order is already CANCELADO', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: 'CANCELADO',
      });

      await expect(
        service.cancel('order-1', 'acting-user'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the order already has a non-voided remission', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: 'EN_ALMACEN',
        remissions: [{ id: 'remission-1', voidedAt: null }],
      });

      await expect(
        service.cancel('order-1', 'acting-user'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('allows cancelling when every remission on the order has been voided', async () => {
      prisma.order.findUnique
        .mockResolvedValueOnce({
          ...baseOrder,
          status: 'EN_ALMACEN',
          remissions: [{ id: 'remission-1', voidedAt: new Date('2026-01-02') }],
        })
        .mockResolvedValueOnce({ ...baseOrder, status: 'CANCELADO' });
      prisma.order.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cancel('order-1', 'acting-user');

      expect(result.status).toBe('CANCELADO');
    });

    it('throws ConflictException when the guarded update matches no rows (lost the race)', async () => {
      prisma.order.findUnique.mockResolvedValue(baseOrder);
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.cancel('order-1', 'acting-user'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('cancels a PENDIENTE order without touching stock and logs the transition', async () => {
      prisma.order.findUnique
        .mockResolvedValueOnce(baseOrder)
        .mockResolvedValueOnce({ ...baseOrder, status: 'CANCELADO' });
      prisma.order.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cancel('order-1', 'acting-user');

      const updateManyCalls = prisma.order.updateMany.mock.calls as [
        [
          {
            where: {
              id: string;
              status: unknown;
              remissions: { none: object };
            };
            data: { status: string };
          },
        ],
      ];
      expect(updateManyCalls[0][0].where).toEqual({
        id: 'order-1',
        status: { notIn: ['CANCELADO', 'DESPACHADO'] },
        remissions: { none: { voidedAt: null } },
      });
      expect(updateManyCalls[0][0].data).toEqual({
        status: 'CANCELADO',
        cancelledAt: expect.any(Date) as Date,
      });
      expect(result.status).toBe('CANCELADO');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CANCEL' }),
      );
    });

    it('cancels an EN_ALMACEN order without reversing the entrada already recorded', async () => {
      prisma.order.findUnique
        .mockResolvedValueOnce({ ...baseOrder, status: 'EN_ALMACEN' })
        .mockResolvedValueOnce({ ...baseOrder, status: 'CANCELADO' });
      prisma.order.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cancel('order-1', 'acting-user');

      expect(result.status).toBe('CANCELADO');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
