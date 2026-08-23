import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('ProductsService', () => {
  const baseProduct = {
    id: 'product-1',
    sku: 'SKU-001',
    name: 'Tornillo 1/4"',
    type: 'RAW_MATERIAL',
    categoryId: 'category-1',
    unitId: 'unit-1',
    minStock: null,
    maxStock: null,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    category: { id: 'category-1', name: 'Materias Primas' },
    unit: { id: 'unit-1', name: 'Unidad', abbreviation: 'u' },
  };

  let prisma: {
    product: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };
  let service: ProductsService;

  beforeEach(() => {
    prisma = {
      product: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    audit = { log: jest.fn() };
    service = new ProductsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  it('creates a product and logs a CREATE audit entry', async () => {
    prisma.product.create.mockResolvedValue(baseProduct);

    const result = await service.create(
      {
        sku: 'SKU-001',
        name: 'Tornillo 1/4"',
        type: 'RAW_MATERIAL',
        categoryId: 'category-1',
        unitId: 'unit-1',
      },
      'acting-user',
    );

    expect(result).toEqual(baseProduct);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entity: 'Product',
        userId: 'acting-user',
      }),
    );
  });

  it('lists products paginated and ordered by name by default', async () => {
    prisma.product.findMany.mockResolvedValue([baseProduct]);
    prisma.product.count.mockResolvedValue(1);

    const result = await service.findAll({});

    expect(result).toEqual({
      data: [baseProduct],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { name: 'asc' } }),
    );
  });

  it('searches products by name, sku, finish, material, or size', async () => {
    prisma.product.findMany.mockResolvedValue([baseProduct]);
    prisma.product.count.mockResolvedValue(1);

    await service.findAll({ search: 'SKU-001' });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: 'SKU-001', mode: 'insensitive' } },
            { sku: { contains: 'SKU-001', mode: 'insensitive' } },
            { finish: { contains: 'SKU-001', mode: 'insensitive' } },
            { material: { contains: 'SKU-001', mode: 'insensitive' } },
            { size: { contains: 'SKU-001', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('sorts products by sku when requested', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await service.findAll({ sortBy: 'sku', sortOrder: 'desc' });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { sku: 'desc' } }),
    );
  });

  it('throws NotFoundException when findOne cannot find the product', async () => {
    prisma.product.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates a product and logs an UPDATE audit entry with before/after', async () => {
    prisma.product.findUnique.mockResolvedValue(baseProduct);
    prisma.product.update.mockResolvedValue({
      ...baseProduct,
      name: 'Tornillo 3/8"',
    });

    const result = await service.update(
      'product-1',
      { name: 'Tornillo 3/8"' },
      'acting-user',
    );

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { name: 'Tornillo 3/8"' },
      include: { category: true, unit: true },
    });
    expect(result.name).toBe('Tornillo 3/8"');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entity: 'Product',
        before: baseProduct,
      }),
    );
  });

  it('deactivates a product by setting isActive to false and logs a DEACTIVATE audit entry', async () => {
    prisma.product.findUnique.mockResolvedValue(baseProduct);
    prisma.product.update.mockResolvedValue({
      ...baseProduct,
      isActive: false,
    });

    const result = await service.deactivate('product-1', 'acting-user');

    expect(result.isActive).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEACTIVATE' }),
    );
  });
});
