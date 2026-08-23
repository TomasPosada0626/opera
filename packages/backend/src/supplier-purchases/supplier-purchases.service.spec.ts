import { NotFoundException } from '@nestjs/common';
import { SupplierPurchasesService } from './supplier-purchases.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('SupplierPurchasesService', () => {
  const supplier = { id: 'supplier-1', name: 'Maderas del Norte S.A.S.' };
  const product = { id: 'product-1', name: 'Tabla de pino' };
  const basePurchase = {
    id: 'purchase-1',
    supplierId: supplier.id,
    productId: product.id,
    quantity: '10',
    unitCost: '5000',
    purchasedAt: new Date('2026-01-10'),
    userId: 'acting-user',
    supplier,
    product,
    user: { id: 'acting-user', name: 'Admin' },
  };

  let prisma: {
    supplier: { findUnique: jest.Mock };
    product: { findUnique: jest.Mock };
    supplierPurchase: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };
  let service: SupplierPurchasesService;

  beforeEach(() => {
    prisma = {
      supplier: { findUnique: jest.fn() },
      product: { findUnique: jest.fn() },
      supplierPurchase: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    audit = { log: jest.fn() };
    service = new SupplierPurchasesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );

    prisma.supplier.findUnique.mockResolvedValue(supplier);
    prisma.product.findUnique.mockResolvedValue(product);
  });

  describe('create', () => {
    it('throws NotFoundException when the supplier does not exist', async () => {
      prisma.supplier.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            supplierId: 'missing',
            productId: product.id,
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
            quantity: 10,
            unitCost: 5000,
          },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.supplierPurchase.create).not.toHaveBeenCalled();
    });

    it('creates a purchase log entry and logs a CREATE audit entry', async () => {
      prisma.supplierPurchase.create.mockResolvedValue(basePurchase);

      const result = await service.create(
        {
          supplierId: supplier.id,
          productId: product.id,
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
