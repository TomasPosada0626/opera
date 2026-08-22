import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
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
    order: { count: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let inventory: { getStock: jest.Mock };
  let audit: { log: jest.Mock };
  let service: OrdersService;

  // La transacción se mockea ejecutando el callback contra un `tx` falso
  // que apenas soporta lo que el servicio realmente usa — no un cliente
  // Prisma real, no hace falta Postgres para probar la lógica de negocio.
  function txStub(overrides: {
    stockByProduct?: Record<string, string>;
    orderCreate?: unknown;
    movementCreate?: jest.Mock;
  }) {
    const stockByProduct = overrides.stockByProduct ?? {};
    return {
      order: {
        create: jest.fn().mockResolvedValue(overrides.orderCreate),
      },
      stockMovement: {
        create: overrides.movementCreate ?? jest.fn(),
      },
      __stockByProduct: stockByProduct,
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
      },
      $transaction: jest.fn(),
    };
    inventory = { getStock: jest.fn() };
    audit = { log: jest.fn() };
    service = new OrdersService(
      prisma as unknown as PrismaService,
      inventory as unknown as InventoryService,
      audit as unknown as AuditService,
    );

    prisma.customer.findUnique.mockResolvedValue(customer);
    prisma.warehouse.findUnique.mockResolvedValue(warehouse);
    prisma.product.findMany.mockResolvedValue([product]);
  });

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
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects with insufficient stock and does not create the order', async () => {
    inventory.getStock.mockResolvedValue(new Prisma.Decimal(1));
    const orderCreate = jest.fn();
    prisma.$transaction.mockImplementation(
      (callback: (tx: TxStub) => Promise<unknown>) => {
        const tx = txStub({ orderCreate: undefined });
        tx.order.create = orderCreate;
        return callback(tx);
      },
    );

    await expect(
      service.create(
        {
          customerId: customer.id,
          warehouseId: warehouse.id,
          items: [{ productId: product.id, quantity: 5, unitPrice: 10 }],
        },
        'acting-user',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('creates the order, writes a SALIDA movement per line, and logs a CREATE audit entry', async () => {
    inventory.getStock.mockResolvedValue(new Prisma.Decimal(10));
    const movementCreate = jest.fn();
    const orderCreate = jest.fn().mockResolvedValue(baseOrder);
    prisma.$transaction.mockImplementation(
      (callback: (tx: TxStub) => Promise<unknown>) => {
        const tx = txStub({ movementCreate });
        tx.order.create = orderCreate;
        return callback(tx);
      },
    );

    const result = await service.create(
      {
        customerId: customer.id,
        warehouseId: warehouse.id,
        items: [{ productId: product.id, quantity: 2, unitPrice: 50 }],
      },
      'acting-user',
    );

    expect(result).toEqual(baseOrder);

    const orderCreateCalls = orderCreate.mock.calls as [
      [
        {
          data: {
            customerId: string;
            warehouseId: string;
            userId: string;
          };
        },
      ],
    ];
    expect(orderCreateCalls[0][0].data).toEqual(
      expect.objectContaining({
        customerId: customer.id,
        warehouseId: warehouse.id,
        userId: 'acting-user',
      }),
    );

    const movementCalls = movementCreate.mock.calls as [
      [
        {
          data: {
            productId: string;
            warehouseId: string;
            type: string;
            reason: string;
            quantity: Prisma.Decimal;
          };
        },
      ],
    ];
    const movementData = movementCalls[0][0].data;
    expect(movementData).toEqual(
      expect.objectContaining({
        productId: product.id,
        warehouseId: warehouse.id,
        type: 'SALIDA',
      }),
    );
    expect(movementData.reason).toContain(baseOrder.id);
    expect(movementData.quantity.toString()).toBe('-2');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entity: 'Order',
        userId: 'acting-user',
      }),
    );
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
});
