import { NotFoundException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('SuppliersService', () => {
  const baseSupplier = {
    id: 'supplier-1',
    name: 'Maderas del Norte S.A.S.',
    taxId: '800987654-2',
    email: 'ventas@maderasdelnorte.test',
    phone: '3009876543',
    address: 'Carrera 10 #20-30',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  let prisma: {
    supplier: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };
  let service: SuppliersService;

  beforeEach(() => {
    prisma = {
      supplier: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    audit = { log: jest.fn() };
    service = new SuppliersService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  it('creates a supplier and logs a CREATE audit entry', async () => {
    prisma.supplier.create.mockResolvedValue(baseSupplier);

    const result = await service.create(
      { name: 'Maderas del Norte S.A.S.' },
      'acting-user',
    );

    expect(result).toEqual(baseSupplier);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entity: 'Supplier',
        userId: 'acting-user',
      }),
    );
  });

  it('lists suppliers paginated and ordered by name by default', async () => {
    prisma.supplier.findMany.mockResolvedValue([baseSupplier]);
    prisma.supplier.count.mockResolvedValue(1);

    const result = await service.findAll({});

    expect(result).toEqual({
      data: [baseSupplier],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('filters suppliers by name when search is given', async () => {
    prisma.supplier.findMany.mockResolvedValue([]);
    prisma.supplier.count.mockResolvedValue(0);

    await service.findAll({ search: 'norte' });

    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'norte', mode: 'insensitive' } },
      }),
    );
    expect(prisma.supplier.count).toHaveBeenCalledWith({
      where: { name: { contains: 'norte', mode: 'insensitive' } },
    });
  });

  it('falls back to sorting by name when sortBy is not an allowed field', async () => {
    prisma.supplier.findMany.mockResolvedValue([]);
    prisma.supplier.count.mockResolvedValue(0);

    await service.findAll({ sortBy: 'taxId', sortOrder: 'desc' });

    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'desc' } }),
    );
  });

  it('throws NotFoundException when findOne cannot find the supplier', async () => {
    prisma.supplier.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws NotFoundException when updating a supplier that does not exist', async () => {
    prisma.supplier.findUnique.mockResolvedValue(null);

    await expect(
      service.update('missing', { name: 'New name' }, 'acting-user'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.supplier.update).not.toHaveBeenCalled();
  });

  it('updates a supplier and logs an UPDATE audit entry with before/after', async () => {
    prisma.supplier.findUnique.mockResolvedValue(baseSupplier);
    prisma.supplier.update.mockResolvedValue({
      ...baseSupplier,
      phone: '3001112233',
    });

    const result = await service.update(
      'supplier-1',
      { phone: '3001112233' },
      'acting-user',
    );

    expect(prisma.supplier.update).toHaveBeenCalledWith({
      where: { id: 'supplier-1' },
      data: { phone: '3001112233' },
    });
    expect(result.phone).toBe('3001112233');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entity: 'Supplier',
        before: baseSupplier,
      }),
    );
  });

  it('deactivates a supplier by setting isActive to false and logs a DEACTIVATE audit entry', async () => {
    prisma.supplier.findUnique.mockResolvedValue(baseSupplier);
    prisma.supplier.update.mockResolvedValue({
      ...baseSupplier,
      isActive: false,
    });

    const result = await service.deactivate('supplier-1', 'acting-user');

    expect(prisma.supplier.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'supplier-1' },
        data: { isActive: false },
      }),
    );
    expect(result.isActive).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEACTIVATE' }),
    );
  });

  it('reactivates a supplier by setting isActive to true and logs a REACTIVATE audit entry', async () => {
    prisma.supplier.findUnique.mockResolvedValue({
      ...baseSupplier,
      isActive: false,
    });
    prisma.supplier.update.mockResolvedValue({
      ...baseSupplier,
      isActive: true,
    });

    const result = await service.reactivate('supplier-1', 'acting-user');

    expect(prisma.supplier.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'supplier-1' },
        data: { isActive: true },
      }),
    );
    expect(result.isActive).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REACTIVATE' }),
    );
  });

  it('anonymizes a supplier by redacting PII and deactivating it, logging only "after"', async () => {
    prisma.supplier.findUnique.mockResolvedValue(baseSupplier);
    const anonymized = {
      ...baseSupplier,
      name: 'Proveedor eliminado',
      taxId: null,
      email: null,
      phone: null,
      address: null,
      isActive: false,
    };
    prisma.supplier.update.mockResolvedValue(anonymized);

    const result = await service.anonymize('supplier-1', 'acting-user');

    expect(prisma.supplier.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'supplier-1' },
        data: {
          name: 'Proveedor eliminado',
          taxId: null,
          email: null,
          phone: null,
          address: null,
          isActive: false,
        },
      }),
    );
    expect(result).toEqual(anonymized);
    // Objeto exacto (no objectContaining): también prueba que nunca se
    // filtra un "before" con la PII real al audit trail.
    expect(audit.log).toHaveBeenCalledWith({
      userId: 'acting-user',
      entity: 'Supplier',
      entityId: 'supplier-1',
      action: 'ANONYMIZE',
      after: anonymized,
    });
  });

  it('throws NotFoundException when anonymizing a supplier that does not exist', async () => {
    prisma.supplier.findUnique.mockResolvedValue(null);

    await expect(
      service.anonymize('missing', 'acting-user'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.supplier.update).not.toHaveBeenCalled();
  });
});
