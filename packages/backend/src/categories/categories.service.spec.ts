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

  it('throws NotFoundException when findOne cannot find the category', async () => {
    prisma.category.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
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
