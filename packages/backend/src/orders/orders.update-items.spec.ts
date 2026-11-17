import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';

const D = (value: number | string) => new Prisma.Decimal(value);

// Editar las líneas de un pedido (ADR 0013). Spec aparte de
// orders.service.spec.ts: la transacción se mockea con un `tx` falso que
// guarda cada escritura, y cada caso arma el pedido que necesita.
describe('OrdersService.updateItems', () => {
  const product = { id: 'product-1', name: 'Botón 31L', isActive: true };
  const otherProduct = { id: 'product-2', name: 'Botón 24L', isActive: true };

  function item(
    id: string,
    quantity: number,
    unitPrice: number,
    position = 0,
    productId = product.id,
  ) {
    return {
      id,
      productId,
      product: productId === product.id ? product : otherProduct,
      quantity: D(quantity),
      unitPrice: D(unitPrice),
      position,
    };
  }

  function pendingProduction(
    id: string,
    orderItemId: string,
    quantity: number,
  ) {
    return {
      id,
      orderItemId,
      status: 'PENDIENTE',
      quantity: D(quantity),
    };
  }

  interface Scenario {
    status: string;
    items: ReturnType<typeof item>[];
    pending?: ReturnType<typeof pendingProduction>[];
    // Despachado vigente por línea.
    delivered?: Record<string, number>;
    // Líneas con alguna remisión (aun anulada).
    withRemissions?: string[];
    // PENDIENTE que quedan después de editar.
    pendingAfter?: number;
    // Líneas tal como quedan, para decidir despachado/almacén.
    itemsAfter?: ReturnType<typeof item>[];
    productionUpdateCount?: number;
  }

  function txStub(scenario: Scenario) {
    const order = {
      id: 'order-1',
      number: 12,
      warehouseId: 'warehouse-1',
      status: scenario.status,
      items: scenario.items,
      productionOrders: scenario.pending ?? [],
    };
    return {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...order, items: scenario.itemsAfter ?? [] }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderItem: {
        create: jest.fn().mockResolvedValue({ id: 'item-new' }),
        update: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest
          .fn()
          .mockResolvedValue(scenario.itemsAfter ?? scenario.items),
      },
      remissionItem: {
        groupBy: jest.fn().mockResolvedValue(
          Object.entries(scenario.delivered ?? {}).map(
            ([orderItemId, quantity]) => ({
              orderItemId,
              _sum: { quantity: D(quantity) },
            }),
          ),
        ),
        findMany: jest.fn().mockResolvedValue(
          (scenario.withRemissions ?? []).map((orderItemId) => ({
            orderItemId,
          })),
        ),
      },
      productionOrder: {
        create: jest.fn(),
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: scenario.productionUpdateCount ?? 1 }),
        count: jest.fn().mockResolvedValue(scenario.pendingAfter ?? 0),
      },
    };
  }
  type TxStub = ReturnType<typeof txStub>;

  let prisma: {
    product: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let service: OrdersService;

  function run(scenario: Scenario): TxStub {
    const tx = txStub(scenario);
    prisma.$transaction.mockImplementation(
      (callback: (tx: TxStub) => Promise<unknown>) => callback(tx),
    );
    return tx;
  }

  beforeEach(() => {
    prisma = {
      product: { findMany: jest.fn().mockResolvedValue([otherProduct]) },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };
    service = new OrdersService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      {} as InventoryService,
    );
  });

  it('en un pedido pendiente cambia, agrega y quita líneas sin tocar producción', async () => {
    const tx = run({
      status: 'PENDIENTE',
      items: [item('item-1', 10, 500, 0), item('item-2', 5, 300, 1)],
    });

    await service.updateItems(
      'order-1',
      {
        items: [
          { id: 'item-1', productId: product.id, quantity: 12, unitPrice: 450 },
          { productId: otherProduct.id, quantity: 3, unitPrice: 200 },
        ],
      },
      'user-1',
    );

    expect(tx.orderItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['item-2'] } },
    });
    expect(tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { quantity: D(12), unitPrice: D(450), position: 0 },
    });
    expect(tx.orderItem.create).toHaveBeenCalledWith({
      data: {
        position: 1,
        orderId: 'order-1',
        productId: otherProduct.id,
        quantity: D(3),
        unitPrice: D(200),
      },
    });
    expect(tx.productionOrder.create).not.toHaveBeenCalled();
    expect(tx.productionOrder.count).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'Order', action: 'UPDATE_ITEMS' }),
    );
  });

  it('no deja editar un pedido cancelado', async () => {
    run({ status: 'CANCELADO', items: [item('item-1', 10, 500)] });

    await expect(
      service.updateItems(
        'order-1',
        {
          items: [
            {
              id: 'item-1',
              productId: product.id,
              quantity: 11,
              unitPrice: 500,
            },
          ],
        },
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('no deja la cantidad por debajo de lo despachado', async () => {
    const tx = run({
      status: 'EN_ALMACEN',
      items: [item('item-1', 10, 500)],
      delivered: { 'item-1': 8 },
    });

    await expect(
      service.updateItems(
        'order-1',
        {
          items: [
            {
              id: 'item-1',
              productId: product.id,
              quantity: 6,
              unitPrice: 500,
            },
          ],
        },
        'user-1',
      ),
    ).rejects.toThrow(/ya se despacharon 8/);
    expect(tx.orderItem.update).not.toHaveBeenCalled();
  });

  it('no cambia el precio de una línea con despachos', async () => {
    run({
      status: 'EN_ALMACEN',
      items: [item('item-1', 10, 500)],
      delivered: { 'item-1': 2 },
    });

    await expect(
      service.updateItems(
        'order-1',
        {
          items: [
            {
              id: 'item-1',
              productId: product.id,
              quantity: 10,
              unitPrice: 600,
            },
          ],
        },
        'user-1',
      ),
    ).rejects.toThrow(/el precio no se cambia/);
  });

  it('no quita una línea que ya tuvo remisiones', async () => {
    const tx = run({
      status: 'EN_ALMACEN',
      items: [item('item-1', 10, 500, 0), item('item-2', 5, 300, 1)],
      withRemissions: ['item-2'],
    });

    await expect(
      service.updateItems(
        'order-1',
        {
          items: [
            {
              id: 'item-1',
              productId: product.id,
              quantity: 10,
              unitPrice: 500,
            },
          ],
        },
        'user-1',
      ),
    ).rejects.toThrow(/ya tiene remisiones/);
    expect(tx.orderItem.deleteMany).not.toHaveBeenCalled();
  });

  it('no cambia el producto de una línea existente', async () => {
    run({ status: 'PENDIENTE', items: [item('item-1', 10, 500)] });

    await expect(
      service.updateItems(
        'order-1',
        {
          items: [
            {
              id: 'item-1',
              productId: otherProduct.id,
              quantity: 10,
              unitPrice: 500,
            },
          ],
        },
        'user-1',
      ),
    ).rejects.toThrow(/no se cambia/);
  });

  it('rechaza una línea de otro pedido', async () => {
    run({ status: 'PENDIENTE', items: [item('item-1', 10, 500)] });

    await expect(
      service.updateItems(
        'order-1',
        {
          items: [
            {
              id: 'item-x',
              productId: product.id,
              quantity: 10,
              unitPrice: 500,
            },
          ],
        },
        'user-1',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rechaza una línea repetida antes de abrir la transacción', async () => {
    await expect(
      service.updateItems(
        'order-1',
        {
          items: [
            { id: 'item-1', productId: product.id, quantity: 1, unitPrice: 1 },
            { id: 'item-1', productId: product.id, quantity: 2, unitPrice: 1 },
          ],
        },
        'user-1',
      ),
    ).rejects.toThrow(/repetida/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('en producción, lo agregado suma a la orden pendiente de la línea', async () => {
    const tx = run({
      status: 'EN_PRODUCCION',
      items: [item('item-1', 100, 500)],
      pending: [pendingProduction('po-1', 'item-1', 100)],
      pendingAfter: 1,
    });

    await service.updateItems(
      'order-1',
      {
        items: [
          {
            id: 'item-1',
            productId: product.id,
            quantity: 120,
            unitPrice: 500,
          },
        ],
      },
      'user-1',
    );

    expect(tx.productionOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'po-1', status: 'PENDIENTE' },
      data: { quantity: D(120) },
    });
    expect(tx.productionOrder.create).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('en almacén, los extras abren una orden nueva y el pedido vuelve a producción', async () => {
    const tx = run({
      status: 'EN_ALMACEN',
      items: [item('item-1', 100, 500)],
      pendingAfter: 1,
    });

    await service.updateItems(
      'order-1',
      {
        items: [
          {
            id: 'item-1',
            productId: product.id,
            quantity: 120,
            unitPrice: 500,
          },
        ],
      },
      'user-1',
    );

    expect(tx.productionOrder.create).toHaveBeenCalledWith({
      data: {
        productId: product.id,
        warehouseId: 'warehouse-1',
        userId: 'user-1',
        orderId: 'order-1',
        orderItemId: 'item-1',
        quantity: D(20),
      },
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: 'EN_PRODUCCION', warehousedAt: null, dispatchedAt: null },
    });
  });

  it('una línea nueva en un pedido ya en producción se manda entera a producción', async () => {
    const tx = run({
      status: 'EN_PRODUCCION',
      items: [item('item-1', 100, 500)],
      pending: [pendingProduction('po-1', 'item-1', 100)],
      pendingAfter: 2,
    });

    await service.updateItems(
      'order-1',
      {
        items: [
          {
            id: 'item-1',
            productId: product.id,
            quantity: 100,
            unitPrice: 500,
          },
          { productId: otherProduct.id, quantity: 40, unitPrice: 200 },
        ],
      },
      'user-1',
    );

    expect(tx.productionOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderItemId: 'item-new',
        productId: otherProduct.id,
        quantity: D(40),
      }) as object,
    });
    // La línea sin cambios no toca su orden.
    expect(tx.productionOrder.updateMany).not.toHaveBeenCalled();
  });

  it('lo quitado resta de lo pendiente y, sin pendientes, el pedido pasa a almacén', async () => {
    const tx = run({
      status: 'EN_PRODUCCION',
      items: [item('item-1', 120, 500)],
      pending: [pendingProduction('po-2', 'item-1', 20)],
      pendingAfter: 0,
      itemsAfter: [item('item-1', 95, 500)],
    });

    await service.updateItems(
      'order-1',
      {
        items: [
          { id: 'item-1', productId: product.id, quantity: 95, unitPrice: 500 },
        ],
      },
      'user-1',
    );

    // Bajó 25 pero solo quedaban 20 por producir: esa orden se cancela y lo
    // ya producido de más queda en inventario.
    expect(tx.productionOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'po-2', status: 'PENDIENTE' },
      data: { status: 'CANCELADA' },
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'EN_PRODUCCION' },
      data: { status: 'EN_ALMACEN', warehousedAt: expect.any(Date) as Date },
    });
  });

  it('en almacén, bajar a lo ya despachado deja el pedido despachado', async () => {
    const tx = run({
      status: 'EN_ALMACEN',
      items: [item('item-1', 10, 500)],
      delivered: { 'item-1': 6 },
      pendingAfter: 0,
      itemsAfter: [item('item-1', 6, 500)],
    });

    await service.updateItems(
      'order-1',
      {
        items: [
          { id: 'item-1', productId: product.id, quantity: 6, unitPrice: 500 },
        ],
      },
      'user-1',
    );

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'EN_ALMACEN' },
      data: { status: 'DESPACHADO', dispatchedAt: expect.any(Date) as Date },
    });
  });

  it('responde 409 si la orden pendiente se completó mientras tanto', async () => {
    run({
      status: 'EN_PRODUCCION',
      items: [item('item-1', 100, 500)],
      pending: [pendingProduction('po-1', 'item-1', 100)],
      productionUpdateCount: 0,
    });

    await expect(
      service.updateItems(
        'order-1',
        {
          items: [
            {
              id: 'item-1',
              productId: product.id,
              quantity: 110,
              unitPrice: 500,
            },
          ],
        },
        'user-1',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('traduce un conflicto de serialización a 409', async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('write conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.updateItems(
        'order-1',
        {
          items: [
            { id: 'item-1', productId: product.id, quantity: 1, unitPrice: 1 },
          ],
        },
        'user-1',
      ),
    ).rejects.toThrow(ConflictException);
  });
});
