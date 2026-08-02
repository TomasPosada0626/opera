import { NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('CategoriesService', () => {
  const baseCategory = {
    id: 'category-1',
    name: 'Materias Primas',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  let prisma: {
    category: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };
  let service: CategoriesService;

  beforeEach(() => {
    prisma = {
      category: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    audit = { log: jest.fn() };
    service = new CategoriesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  it('creates a category and logs a CREATE audit entry', async () => {
    prisma.category.create.mockResolvedValue(baseCategory);

    const result = await service.create(
      { name: 'Materias Primas' },
      'acting-user',
    );

    expect(result).toEqual(baseCategory);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entity: 'Category',
        userId: 'acting-user',
      }),
    );
  });

  it('lists categories paginated and filtered by search', async () => {
    prisma.category.findMany.mockResolvedValue([baseCategory]);
    prisma.category.count.mockResolvedValue(1);

    const result = await service.findAll({ search: 'prima' });

    expect(result).toEqual({
      data: [baseCategory],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'prima', mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('throws NotFoundException when findOne cannot find the category', async () => {
    prisma.category.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates a category and logs an UPDATE audit entry with before/after', async () => {
    prisma.category.findUnique.mockResolvedValue(baseCategory);
    prisma.category.update.mockResolvedValue({
      ...baseCategory,
      name: 'Updated',
    });

    const result = await service.update(
      'category-1',
      { name: 'Updated' },
      'acting-user',
    );

    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'category-1' },
      data: { name: 'Updated' },
    });
    expect(result.name).toBe('Updated');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entity: 'Category',
        before: baseCategory,
      }),
    );
  });

  it('deactivates a category by setting isActive to false and logs a DEACTIVATE audit entry', async () => {
    prisma.category.findUnique.mockResolvedValue(baseCategory);
    prisma.category.update.mockResolvedValue({
      ...baseCategory,
      isActive: false,
    });

    const result = await service.deactivate('category-1', 'acting-user');

    expect(result.isActive).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEACTIVATE' }),
    );
  });
});
