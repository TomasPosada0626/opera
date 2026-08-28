import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SupplierPurchasesService } from './supplier-purchases.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('SupplierPurchasesService', () => {
  const supplier = {
    id: 'supplier-1',
    name: 'Maderas del Norte S.A.S.',
    isActive: true,
  };
  const product = {
    id: 'product-1',
    name: 'Tabla de pino',
    isActive: true,
  };
  const warehouse = {
    id: 'warehouse-1',
    name: 'Bodega principal',
    isActive: true,
  };
  const basePurchase = {
    id: 'purchase-1',
    supplierId: supplier.id,
    productId: product.id,
    warehouseId: warehouse.id,
    quantity: '10',
    unitCost: '5000',
    purchasedAt: new Date('2026-01-10'),
    userId: 'acting-user',
    receivedAt: null,
    stockMovementId: null,
    supplier,
    product,
    warehouse,
    user: { id: 'acting-user', name: 'Admin' },
  };

  let prisma: {
    supplier: { findUnique: jest.Mock };
    product: { findUnique: jest.Mock };
    warehouse: { findUnique: jest.Mock };
    supplierPurchase: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let service: SupplierPurchasesService;

  // Mismo espíritu que orders.service.spec.ts / remissions.service.spec.ts:
  // la transacción se mockea ejecutando el callback contra un `tx` falso.
  function txStub(overrides: {
    updateManyCount?: number;
    movement?: { id: string };
    updatedPurchase?: unknown;
  }) {
    return {
      supplierPurchase: {
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: overrides.updateManyCount ?? 1 }),
        update: jest
          .fn()
          .mockResolvedValue(overrides.updatedPurchase ?? basePurchase),
      },
      stockMovement: {
        create: jest
          .fn()
          .mockResolvedValue(overrides.movement ?? { id: 'movement-1' }),
      },
    };
  }
  type TxStub = ReturnType<typeof txStub>;

  beforeEach(() => {
    prisma = {
      supplier: { findUnique: jest.fn() },
      product: { findUnique: jest.fn() },
      warehouse: { findUnique: jest.fn() },
      supplierPurchase: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };
    service = new SupplierPurchasesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );

    prisma.supplier.findUnique.mockResolvedValue(supplier);
    prisma.product.findUnique.mockResolvedValue(product);
    prisma.warehouse.findUnique.mockResolvedValue(warehouse);
  });

  describe('create', () => {
    it('throws NotFoundException when the supplier does not exist', async () => {
      prisma.supplier.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            supplierId: 'missing',
            productId: product.id,
            warehouseId: warehouse.id,
            quantity: 10,
            unitCost: 5000,
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.supplierPurchase.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            supplierId: supplier.id,
            productId: 'missing',
            warehouseId: warehouse.id,
            quantity: 10,
            unitCost: 5000,
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.supplierPurchase.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the warehouse does not exist', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            supplierId: supplier.id,
            productId: product.id,
            warehouseId: 'missing',
            quantity: 10,
            unitCost: 5000,
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.supplierPurchase.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the supplier is deactivated', async () => {
      prisma.supplier.findUnique.mockResolvedValue({
        ...supplier,
        isActive: false,
      });

      await expect(
        service.create(
          {
            supplierId: supplier.id,
            productId: product.id,
            warehouseId: warehouse.id,
            quantity: 10,
            unitCost: 5000,
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.supplierPurchase.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the product is deactivated', async () => {
      prisma.product.findUnique.mockResolvedValue({
        ...product,
        isActive: false,
      });

      await expect(
        service.create(
          {
            supplierId: supplier.id,
            productId: product.id,
            warehouseId: warehouse.id,
            quantity: 10,
            unitCost: 5000,
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.supplierPurchase.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the warehouse is deactivated', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        ...warehouse,
        isActive: false,
      });

      await expect(
        service.create(
          {
            supplierId: supplier.id,
            productId: product.id,
            warehouseId: warehouse.id,
            quantity: 10,
            unitCost: 5000,
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.supplierPurchase.create).not.toHaveBeenCalled();
    });

    it('creates a purchase log entry and logs a CREATE audit entry', async () => {
      prisma.supplierPurchase.create.mockResolvedValue(basePurchase);

      const result = await service.create(
        {
          supplierId: supplier.id,
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: 10,
          unitCost: 5000,
        },
        'acting-user',
      );

      expect(result).toEqual(basePurchase);
      const createCall = prisma.supplierPurchase.create.mock.calls as [
        [{ data: Record<string, unknown> }],
      ];
      expect(createCall[0][0].data).toEqual({
        supplierId: supplier.id,
        productId: product.id,
        warehouseId: warehouse.id,
        quantity: 10,
        unitCost: 5000,
        userId: 'acting-user',
        purchasedAt: undefined,
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'SupplierPurchase',
          userId: 'acting-user',
        }),
      );
    });

    it('converts an explicit purchasedAt string to a Date', async () => {
      prisma.supplierPurchase.create.mockResolvedValue(basePurchase);

      await service.create(
        {
          supplierId: supplier.id,
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: 10,
          unitCost: 5000,
          purchasedAt: '2026-01-05T00:00:00.000Z',
        },
        'acting-user',
      );

      const createCall = prisma.supplierPurchase.create.mock.calls as [
        [{ data: { purchasedAt: Date } }],
      ];
      expect(createCall[0][0].data.purchasedAt).toEqual(
        new Date('2026-01-05T00:00:00.000Z'),
      );
    });
  });

  describe('receive', () => {
    it('throws NotFoundException when the purchase does not exist', async () => {
      prisma.supplierPurchase.findUnique.mockResolvedValue(null);

      await expect(
        service.receive('missing', 'acting-user'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a purchase with no warehouse on record', async () => {
      prisma.supplierPurchase.findUnique.mockResolvedValue({
        ...basePurchase,
        warehouseId: null,
      });

      await expect(
        service.receive('purchase-1', 'acting-user'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('writes a full-quantity ENTRADA and links it back to the purchase', async () => {
      prisma.supplierPurchase.findUnique.mockResolvedValue(basePurchase);
      const movementCreate = jest
        .fn<Promise<{ id: string }>, [{ data: Record<string, unknown> }]>()
        .mockResolvedValue({ id: 'movement-1' });
      const purchaseUpdate = jest.fn().mockResolvedValue({
        ...basePurchase,
        receivedAt: new Date('2026-01-11'),
        stockMovementId: 'movement-1',
      });
      prisma.$transaction.mockImplementation(
        (callback: (tx: TxStub) => Promise<unknown>) => {
          const tx = txStub({ movement: { id: 'movement-1' } });
          tx.stockMovement.create = movementCreate;
          tx.supplierPurchase.update = purchaseUpdate;
          return callback(tx);
        },
      );

      const result = await service.receive('purchase-1', 'acting-user');

      const movementCreateCall = movementCreate.mock.calls[0][0];
      expect(movementCreateCall.data).toEqual(
        expect.objectContaining({
          productId: product.id,
          warehouseId: warehouse.id,
          type: 'ENTRADA',
          quantity: basePurchase.quantity,
          unitCost: basePurchase.unitCost,
          userId: 'acting-user',
        }),
      );
      expect(purchaseUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { stockMovementId: 'movement-1' },
        }),
      );
      expect(result.stockMovementId).toBe('movement-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RECEIVE' }),
      );
    });

    it('rejects receiving an already-received purchase (concurrency guard)', async () => {
      prisma.supplierPurchase.findUnique.mockResolvedValue(basePurchase);
      prisma.$transaction.mockImplementation(
        (callback: (tx: TxStub) => Promise<unknown>) =>
          callback(txStub({ updateManyCount: 0 })),
      );

      await expect(
        service.receive('purchase-1', 'acting-user'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findAll', () => {
    it('lists purchases paginated, newest first by default', async () => {
      prisma.supplierPurchase.findMany.mockResolvedValue([basePurchase]);
      prisma.supplierPurchase.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result).toEqual({
        data: [basePurchase],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });
      expect(prisma.supplierPurchase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: { purchasedAt: 'desc' },
        }),
      );
    });

    it('filters by supplierId, productId, and date range when given', async () => {
      prisma.supplierPurchase.findMany.mockResolvedValue([]);
      prisma.supplierPurchase.count.mockResolvedValue(0);

      await service.findAll({
        supplierId: supplier.id,
        productId: product.id,
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-02-01T00:00:00.000Z',
      });

      expect(prisma.supplierPurchase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            supplierId: supplier.id,
            productId: product.id,
            purchasedAt: {
              gte: new Date('2026-01-01T00:00:00.000Z'),
              lt: new Date('2026-02-01T00:00:00.000Z'),
            },
          },
        }),
      );
    });
  });
});
