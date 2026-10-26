import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const d = (value: number) => new Prisma.Decimal(value);

function serializationFailure() {
  return new Prisma.PrismaClientKnownRequestError('conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });
}

// Lo que recibió un mock en su primera llamada.
function firstCall(mock: jest.Mock, index = 0): unknown {
  return (mock.mock.calls as unknown[][])[0][index];
}

function dataOf(mock: jest.Mock): Record<string, unknown> {
  return (firstCall(mock) as { data: Record<string, unknown> }).data;
}

function whereOf(mock: jest.Mock): unknown {
  return (firstCall(mock) as { where: unknown }).where;
}

function decimalIn(mock: jest.Mock, field: string): number {
  return (dataOf(mock)[field] as Prisma.Decimal).toNumber();
}

function buildItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    productId: 'product-1',
    quantity: d(10),
    unitCost: d(500),
    quantityReceived: d(0),
    position: 0,
    product: { id: 'product-1', name: 'Lámina de acero' },
    receipts: [],
    ...overrides,
  };
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'po-1',
    number: 7,
    supplierId: 'supplier-1',
    warehouseId: 'warehouse-1',
    status: 'PENDIENTE',
    total: d(5000),
    amountPaid: d(0),
    tracksPayment: true,
    expectedDate: null,
    supplierInvoice: null,
    notes: null,
    items: [buildItem()],
    payments: [],
    ...overrides,
  };
}

describe('PurchaseOrdersService', () => {
  let prisma: {
    supplier: { findUnique: jest.Mock };
    warehouse: { findUnique: jest.Mock };
    product: { findMany: jest.Mock };
    purchaseOrder: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    purchaseOrderItem: { update: jest.Mock; findMany: jest.Mock };
    purchaseReceipt: { create: jest.Mock };
    stockMovement: { create: jest.Mock };
    supplierPayment: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
      aggregate: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let service: PurchaseOrdersService;

  beforeEach(() => {
    prisma = {
      supplier: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'supplier-1', isActive: true }),
      },
      warehouse: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'warehouse-1', isActive: true }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'product-1', name: 'Lámina de acero', isActive: true },
          { id: 'product-2', name: 'Tornillo', isActive: true },
        ]),
      },
      purchaseOrder: {
        create: jest.fn().mockResolvedValue({ id: 'po-1' }),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(buildOrder()),
        findMany: jest.fn().mockResolvedValue([buildOrder()]),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue(buildOrder()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      purchaseOrderItem: {
        update: jest.fn(),
        findMany: jest.fn(),
      },
      purchaseReceipt: { create: jest.fn() },
      stockMovement: {
        create: jest.fn().mockResolvedValue({ id: 'movement-1' }),
      },
      supplierPayment: {
        create: jest.fn().mockResolvedValue({
          id: 'payment-1',
          amount: d(1000),
          method: 'EFECTIVO',
          paidAt: new Date('2026-10-25'),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: d(0) } }),
      },
      $transaction: jest.fn(),
    };
    // La transacción corre el callback contra el mismo prisma falso.
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    audit = { log: jest.fn() };
    service = new PurchaseOrdersService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('create', () => {
    const dto = {
      supplierId: 'supplier-1',
      warehouseId: 'warehouse-1',
      items: [
        { productId: 'product-1', quantity: 10, unitCost: 500 },
        { productId: 'product-2', quantity: 100, unitCost: 45 },
      ],
    };

    it('creates the purchase with its lines in order and the total', async () => {
      await service.create(
        { ...dto, expectedDate: '2026-11-02', supplierInvoice: ' FV-881 ' },
        'user-1',
      );

      const data = dataOf(prisma.purchaseOrder.create);
      expect(decimalIn(prisma.purchaseOrder.create, 'total')).toBe(9500);
      expect(data.supplierInvoice).toBe('FV-881');
      expect((data.items as { create: unknown }).create).toEqual([
        { productId: 'product-1', quantity: 10, unitCost: 500, position: 0 },
        { productId: 'product-2', quantity: 100, unitCost: 45, position: 1 },
      ]);
      expect(prisma.supplierPayment.create).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'PurchaseOrder', action: 'CREATE' }),
      );
    });

    it('records an advance payment in the same step', async () => {
      prisma.purchaseOrder.findUniqueOrThrow.mockResolvedValue(
        buildOrder({ amountPaid: d(2000) }),
      );

      const result = await service.create(
        {
          ...dto,
          initialPayment: {
            amount: 2000,
            method: 'TRANSFERENCIA',
            note: ' Anticipo ',
          },
        },
        'user-1',
      );

      expect(dataOf(prisma.purchaseOrder.create).amountPaid).toBe(2000);
      expect(prisma.supplierPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purchaseOrderId: 'po-1',
          amount: 2000,
          note: 'Anticipo',
        }) as object,
      });
      expect(result.paymentStatus).toBe('ABONADA');
    });

    it('rejects an advance larger than the purchase', async () => {
      await expect(
        service.create(
          { ...dto, initialPayment: { amount: 99999, method: 'EFECTIVO' } },
          'user-1',
        ),
      ).rejects.toThrow(/supera el valor de la compra/);
    });

    it('rejects a repeated product', async () => {
      await expect(
        service.create(
          {
            ...dto,
            items: [dto.items[0], { ...dto.items[0], quantity: 3 }],
          },
          'user-1',
        ),
      ).rejects.toThrow(/producto repetido/);
    });

    it.each([
      ['supplier', 'supplier', null, NotFoundException],
      [
        'inactive supplier',
        'supplier',
        { isActive: false },
        BadRequestException,
      ],
      ['warehouse', 'warehouse', null, NotFoundException],
      [
        'inactive warehouse',
        'warehouse',
        { isActive: false },
        BadRequestException,
      ],
    ] as const)('rejects a missing or %s', async (_, model, value, error) => {
      prisma[model].findUnique.mockResolvedValue(value);
      await expect(service.create(dto, 'user-1')).rejects.toBeInstanceOf(error);
    });

    it('rejects a missing or inactive product', async () => {
      prisma.product.findMany.mockResolvedValueOnce([
        { id: 'product-1', name: 'Lámina de acero', isActive: true },
      ]);
      await expect(service.create(dto, 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      prisma.product.findMany.mockResolvedValueOnce([
        { id: 'product-1', name: 'Lámina de acero', isActive: true },
        { id: 'product-2', name: 'Tornillo', isActive: false },
      ]);
      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        /Tornillo está desactivado/,
      );
    });
  });

  describe('findAll / findOne', () => {
    it('filters by an exact number, supplier and open purchases', async () => {
      const result = await service.findAll({
        search: ' 7 ',
        supplierId: 'supplier-1',
        open: true,
      });

      expect(whereOf(prisma.purchaseOrder.findMany)).toEqual({
        number: 7,
        supplierId: 'supplier-1',
        status: { in: ['PENDIENTE', 'PARCIAL'] },
      });
      expect(result.data[0]).toEqual(
        expect.objectContaining({ paymentStatus: 'PENDIENTE' }),
      );
    });

    it('returns nothing for a non-numeric search, and filters by status', async () => {
      await service.findAll({ search: 'abc', status: 'RECIBIDA' });

      expect(whereOf(prisma.purchaseOrder.findMany)).toEqual({
        id: { in: [] },
        status: 'RECIBIDA',
      });
    });

    it('adds what arrived and what is owed to the detail', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(
        buildOrder({
          status: 'PARCIAL',
          amountPaid: d(1000),
          items: [buildItem({ quantityReceived: d(4) })],
        }),
      );

      const order = await service.findOne('po-1');

      expect(order.receivedValue.toNumber()).toBe(2000);
      expect(order.payable.toNumber()).toBe(1000);
    });

    it('404s for an unknown purchase', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates the tracking data and clears what comes as null', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(
        buildOrder({ supplierInvoice: 'FV-1', notes: 'algo' }),
      );

      await service.update(
        'po-1',
        { expectedDate: '2026-11-10', supplierInvoice: null, notes: ' ' },
        'user-1',
      );

      expect(dataOf(prisma.purchaseOrder.update)).toEqual({
        expectedDate: new Date('2026-11-10'),
        supplierInvoice: null,
        notes: null,
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE' }),
      );
    });

    it('does not touch fields that were not sent', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(buildOrder());
      await service.update('po-1', {}, 'user-1');
      expect(dataOf(prisma.purchaseOrder.update)).toEqual({});
    });

    it('rejects unknown or cancelled purchases', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValueOnce(null);
      await expect(service.update('po-1', {}, 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      prisma.purchaseOrder.findUnique.mockResolvedValueOnce(
        buildOrder({ status: 'CANCELADA' }),
      );
      await expect(service.update('po-1', {}, 'user-1')).rejects.toThrow(
        /cancelada/,
      );
    });
  });

  describe('receive', () => {
    it('writes a stock entry at the purchase cost and marks it partial', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(buildOrder());
      prisma.purchaseOrderItem.findMany.mockResolvedValue([
        buildItem({ quantityReceived: d(4) }),
      ]);

      await service.receive(
        'po-1',
        { items: [{ itemId: 'item-1', quantity: 4 }] },
        'user-1',
      );

      expect(prisma.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'product-1',
          warehouseId: 'warehouse-1',
          type: 'ENTRADA',
          unitCost: d(500),
          reason: 'Recepción de la compra No. 7',
        }) as object,
      });
      expect(prisma.purchaseReceipt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purchaseOrderItemId: 'item-1',
          stockMovementId: 'movement-1',
        }) as object,
      });
      expect(
        decimalIn(prisma.purchaseOrderItem.update, 'quantityReceived'),
      ).toBe(4);
      expect(dataOf(prisma.purchaseOrder.update)).toEqual({
        status: 'PARCIAL',
      });
      expect(firstCall(prisma.$transaction, 1)).toEqual({
        isolationLevel: 'Serializable',
      });
    });

    it('marks it received once every line is complete', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(
        buildOrder({
          status: 'PARCIAL',
          items: [buildItem({ quantityReceived: d(6) })],
        }),
      );
      prisma.purchaseOrderItem.findMany.mockResolvedValue([
        buildItem({ quantityReceived: d(10) }),
      ]);

      await service.receive(
        'po-1',
        {
          items: [{ itemId: 'item-1', quantity: 4 }],
          receivedAt: '2026-10-20T10:00:00.000Z',
        },
        'user-1',
      );

      expect(dataOf(prisma.purchaseReceipt.create).receivedAt).toEqual(
        new Date('2026-10-20T10:00:00.000Z'),
      );
      expect(dataOf(prisma.purchaseOrder.update)).toEqual({
        status: 'RECIBIDA',
      });
    });

    it('rejects receiving more than what is pending on a line', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(
        buildOrder({ items: [buildItem({ quantityReceived: d(8) })] }),
      );

      await expect(
        service.receive(
          'po-1',
          { items: [{ itemId: 'item-1', quantity: 3 }] },
          'user-1',
        ),
      ).rejects.toThrow(/solo faltan 2/);
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('rejects repeated or foreign lines', async () => {
      await expect(
        service.receive(
          'po-1',
          {
            items: [
              { itemId: 'item-1', quantity: 1 },
              { itemId: 'item-1', quantity: 1 },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(/línea repetida/);

      prisma.purchaseOrder.findUnique.mockResolvedValue(buildOrder());
      await expect(
        service.receive(
          'po-1',
          { items: [{ itemId: 'otra', quantity: 1 }] },
          'user-1',
        ),
      ).rejects.toThrow(/no pertenece/);
    });

    it.each([
      [null, NotFoundException, /no encontrada/],
      ['CANCELADA', BadRequestException, /cancelada/],
      ['RECIBIDA', BadRequestException, /nada pendiente/],
      ['CERRADA', BadRequestException, /nada pendiente/],
    ])('rejects a purchase that is %s', async (status, error, message) => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(
        status ? buildOrder({ status }) : null,
      );
      const promise = service.receive(
        'po-1',
        { items: [{ itemId: 'item-1', quantity: 1 }] },
        'user-1',
      );
      await expect(promise).rejects.toBeInstanceOf(error);
      await expect(promise).rejects.toThrow(message);
    });

    it('turns a serialization conflict into a 409 and rethrows anything else', async () => {
      prisma.$transaction.mockRejectedValueOnce(serializationFailure());
      await expect(
        service.receive(
          'po-1',
          { items: [{ itemId: 'item-1', quantity: 1 }] },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      prisma.$transaction.mockRejectedValueOnce(new Error('boom'));
      await expect(
        service.receive(
          'po-1',
          { items: [{ itemId: 'item-1', quantity: 1 }] },
          'user-1',
        ),
      ).rejects.toThrow('boom');
    });
  });

  describe('close', () => {
    it('closes a partial purchase with what arrived as its new total', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(
        buildOrder({
          status: 'PARCIAL',
          amountPaid: d(1000),
          items: [buildItem({ quantityReceived: d(6) })],
        }),
      );

      await service.close('po-1', 'user-1');

      expect(whereOf(prisma.purchaseOrder.updateMany)).toEqual({
        id: 'po-1',
        status: 'PARCIAL',
      });
      expect(dataOf(prisma.purchaseOrder.updateMany).status).toBe('CERRADA');
      expect(decimalIn(prisma.purchaseOrder.updateMany, 'total')).toBe(3000);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CLOSE' }),
      );
    });

    it('rejects closing when more was paid than what arrived', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(
        buildOrder({
          status: 'PARCIAL',
          amountPaid: d(4000),
          items: [buildItem({ quantityReceived: d(6) })],
        }),
      );
      await expect(service.close('po-1', 'user-1')).rejects.toThrow(
        /supera lo recibido/,
      );
    });

    it('rejects unknown, non-partial or concurrently changed purchases', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValueOnce(null);
      await expect(service.close('po-1', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      prisma.purchaseOrder.findUnique.mockResolvedValueOnce(buildOrder());
      await expect(service.close('po-1', 'user-1')).rejects.toThrow(
        /llegó a medias/,
      );

      prisma.purchaseOrder.findUnique.mockResolvedValueOnce(
        buildOrder({ status: 'PARCIAL' }),
      );
      prisma.purchaseOrder.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.close('po-1', 'user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('cancel', () => {
    it('cancels a purchase with nothing received and no payments', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(buildOrder());

      await service.cancel('po-1', 'user-1');

      expect(firstCall(prisma.purchaseOrder.updateMany)).toEqual({
        where: { id: 'po-1', status: 'PENDIENTE' },
        data: { status: 'CANCELADA', cancelledAt: expect.any(Date) as Date },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CANCEL' }),
      );
    });

    it.each([
      [buildOrder({ status: 'CANCELADA' }), /ya está cancelada/],
      [buildOrder({ status: 'PARCIAL' }), /ya recibió mercancía/],
      [buildOrder({ payments: [{ id: 'payment-1' }] }), /pagos vigentes/],
    ])('refuses when it cannot be undone (%#)', async (order, message) => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(order);
      await expect(service.cancel('po-1', 'user-1')).rejects.toThrow(message);
    });

    it('404s, and 409s if it changed in between', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValueOnce(null);
      await expect(service.cancel('po-1', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      prisma.purchaseOrder.findUnique.mockResolvedValueOnce(buildOrder());
      prisma.purchaseOrder.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.cancel('po-1', 'user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('payments', () => {
    it('records a payment and adds it to what was paid', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(
        buildOrder({ amountPaid: d(1000) }),
      );

      await service.addPayment(
        'po-1',
        { amount: 1000, method: 'EFECTIVO', paidAt: '2026-10-24', note: ' ' },
        'user-1',
      );

      expect(prisma.supplierPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purchaseOrderId: 'po-1',
          amount: 1000,
          paidAt: new Date('2026-10-24'),
          note: undefined,
        }) as object,
      });
      expect(decimalIn(prisma.purchaseOrder.update, 'amountPaid')).toBe(2000);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADD_PAYMENT' }),
      );
    });

    it.each([
      [null, /no encontrada/],
      [buildOrder({ status: 'CANCELADA' }), /compra cancelada/],
      [buildOrder({ tracksPayment: false }), /compra histórica/],
      [buildOrder({ amountPaid: d(5000) }), /pagada por completo/],
      [buildOrder({ amountPaid: d(4500) }), /supera el saldo de la compra/],
    ])('rejects a payment that does not fit (%#)', async (order, message) => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(order);
      await expect(
        service.addPayment(
          'po-1',
          { amount: 1000, method: 'EFECTIVO' },
          'user-1',
        ),
      ).rejects.toThrow(message);
    });

    it('turns a serialization conflict into a 409 and rethrows anything else', async () => {
      prisma.$transaction.mockRejectedValueOnce(serializationFailure());
      await expect(
        service.addPayment('po-1', { amount: 1, method: 'EFECTIVO' }, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);

      prisma.$transaction.mockRejectedValueOnce(new Error('boom'));
      await expect(
        service.addPayment('po-1', { amount: 1, method: 'EFECTIVO' }, 'user-1'),
      ).rejects.toThrow('boom');
    });

    it('voids a payment and recomputes what was paid from the rest', async () => {
      prisma.supplierPayment.aggregate.mockResolvedValue({
        _sum: { amount: d(500) },
      });

      await service.voidPayment(
        'po-1',
        'payment-1',
        { reason: 'Transferencia rechazada' },
        'user-1',
      );

      expect(prisma.supplierPayment.updateMany).toHaveBeenCalledWith({
        where: { id: 'payment-1', purchaseOrderId: 'po-1', voidedAt: null },
        data: {
          voidedAt: expect.any(Date) as Date,
          voidReason: 'Transferencia rechazada',
        },
      });
      expect(decimalIn(prisma.purchaseOrder.update, 'amountPaid')).toBe(500);
    });

    it('recomputes to zero when no valid payment is left', async () => {
      prisma.supplierPayment.aggregate.mockResolvedValue({
        _sum: { amount: null },
      });
      await service.voidPayment('po-1', 'payment-1', { reason: 'Error' }, 'u');
      expect(decimalIn(prisma.purchaseOrder.update, 'amountPaid')).toBe(0);
    });

    it('404s for an unknown payment and 400s for one already voided', async () => {
      prisma.supplierPayment.updateMany.mockResolvedValue({ count: 0 });

      prisma.supplierPayment.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.voidPayment('po-1', 'x', { reason: 'Error' }, 'u'),
      ).rejects.toBeInstanceOf(NotFoundException);

      prisma.supplierPayment.findFirst.mockResolvedValueOnce({ id: 'x' });
      await expect(
        service.voidPayment('po-1', 'x', { reason: 'Error' }, 'u'),
      ).rejects.toThrow(/ya está anulado/);
    });
  });
});
