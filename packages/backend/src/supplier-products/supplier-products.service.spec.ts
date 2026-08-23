import { NotFoundException } from '@nestjs/common';
import { SupplierProductsService } from './supplier-products.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('SupplierProductsService', () => {
  const supplier = { id: 'supplier-1', name: 'Maderas del Norte S.A.S.' };
  const product = { id: 'product-1', name: 'Tabla de pino' };
  const baseSupplierProduct = {
    id: 'sp-1',
    supplierId: supplier.id,
    productId: product.id,
    price: '15000',
    supplier,
    product,
  };

  let prisma: {
    supplier: { findUnique: jest.Mock };
    product: { findUnique: jest.Mock };
    supplierProduct: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };
  let service: SupplierProductsService;

  beforeEach(() => {
    prisma = {
      supplier: { findUnique: jest.fn() },
      product: { findUnique: jest.fn() },
      supplierProduct: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    audit = { log: jest.fn() };
    service = new SupplierProductsService(
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
          { supplierId: 'missing', productId: product.id, price: 100 },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.supplierProduct.upsert).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          { supplierId: supplier.id, productId: 'missing', price: 100 },
          'acting-user',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.supplierProduct.upsert).not.toHaveBeenCalled();
    });

    it('creates a new price and logs CREATE when the pair had no price yet', async () => {
      prisma.supplierProduct.findUnique.mockResolvedValue(null);
      prisma.supplierProduct.upsert.mockResolvedValue(baseSupplierProduct);

      const result = await service.create(
        { supplierId: supplier.id, productId: product.id, price: 15000 },
        'acting-user',
      );

      expect(result).toEqual(baseSupplierProduct);
      expect(prisma.supplierProduct.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            supplierId_productId: {
              supplierId: supplier.id,
              productId: product.id,
            },
          },
          create: {
            supplierId: supplier.id,
            productId: product.id,
            price: 15000,
          },
          update: { price: 15000 },
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'SupplierProduct',
          userId: 'acting-user',
        }),
      );
    });

    it('overwrites an existing price and logs UPDATE with before/after', async () => {
      const existing = { ...baseSupplierProduct, price: '10000' };
      prisma.supplierProduct.findUnique.mockResolvedValue(existing);
      prisma.supplierProduct.upsert.mockResolvedValue(baseSupplierProduct);

      const result = await service.create(
        { supplierId: supplier.id, productId: product.id, price: 15000 },
        'acting-user',
      );

      expect(result.price).toBe('15000');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          entity: 'SupplierProduct',
          before: existing,
          after: baseSupplierProduct,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('lists prices paginated, newest first by default', async () => {
      prisma.supplierProduct.findMany.mockResolvedValue([baseSupplierProduct]);
      prisma.supplierProduct.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result).toEqual({
        data: [baseSupplierProduct],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });
      expect(prisma.supplierProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, orderBy: { createdAt: 'desc' } }),
      );
    });

    it('filters by supplierId and productId when given', async () => {
      prisma.supplierProduct.findMany.mockResolvedValue([]);
      prisma.supplierProduct.count.mockResolvedValue(0);

      await service.findAll({ supplierId: supplier.id, productId: product.id });

      expect(prisma.supplierProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { supplierId: supplier.id, productId: product.id },
        }),
      );
    });
  });
});
