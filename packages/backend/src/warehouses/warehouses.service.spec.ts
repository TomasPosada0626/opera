import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('WarehousesService', () => {
  const baseWarehouse = {
    id: 'warehouse-1',
    name: 'Bodega Norte',
    location: 'Calle 45 #12-34',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  let prisma: {
    warehouse: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    stockMovement: { groupBy: jest.Mock };
  };
  let audit: { log: jest.Mock };
  let service: WarehousesService;

  beforeEach(() => {
    prisma = {
      warehouse: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      stockMovement: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    audit = { log: jest.fn() };
    service = new WarehousesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  it('creates a warehouse and logs a CREATE audit entry', async () => {
    prisma.warehouse.create.mockResolvedValue(baseWarehouse);

    const result = await service.create(
      { name: 'Bodega Norte' },
      'acting-user',
    );

    expect(result).toEqual(baseWarehouse);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entity: 'Warehouse',
        userId: 'acting-user',
      }),
    );
  });

  it('lists warehouses paginated and ordered by name by default', async () => {
    prisma.warehouse.findMany.mockResolvedValue([baseWarehouse]);
    prisma.warehouse.count.mockResolvedValue(1);

    const result = await service.findAll({});

    expect(result).toEqual({
      data: [baseWarehouse],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('filters warehouses by name when search is given', async () => {
    prisma.warehouse.findMany.mockResolvedValue([]);
    prisma.warehouse.count.mockResolvedValue(0);

    await service.findAll({ search: 'norte' });

    expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'norte', mode: 'insensitive' } },
      }),
    );
    expect(prisma.warehouse.count).toHaveBeenCalledWith({
      where: { name: { contains: 'norte', mode: 'insensitive' } },
    });
  });

  it('falls back to sorting by name when sortBy is not an allowed field', async () => {
    prisma.warehouse.findMany.mockResolvedValue([]);
    prisma.warehouse.count.mockResolvedValue(0);

    await service.findAll({ sortBy: 'location', sortOrder: 'desc' });

    expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'desc' } }),
    );
  });

  it('throws NotFoundException when findOne cannot find the warehouse', async () => {
    prisma.warehouse.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws NotFoundException when updating a warehouse that does not exist', async () => {
    prisma.warehouse.findUnique.mockResolvedValue(null);

    await expect(
      service.update('missing', { name: 'New name' }, 'acting-user'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.warehouse.update).not.toHaveBeenCalled();
  });

  it('updates a warehouse and logs an UPDATE audit entry with before/after', async () => {
    prisma.warehouse.findUnique.mockResolvedValue(baseWarehouse);
    prisma.warehouse.update.mockResolvedValue({
      ...baseWarehouse,
      location: 'New location',
    });

    const result = await service.update(
      'warehouse-1',
      { location: 'New location' },
      'acting-user',
    );

    expect(prisma.warehouse.update).toHaveBeenCalledWith({
      where: { id: 'warehouse-1' },
      data: { location: 'New location' },
    });
    expect(result.location).toBe('New location');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entity: 'Warehouse',
        before: baseWarehouse,
      }),
    );
  });

  it('deactivates a warehouse by setting isActive to false and logs a DEACTIVATE audit entry', async () => {
    prisma.warehouse.findUnique.mockResolvedValue(baseWarehouse);
    prisma.warehouse.update.mockResolvedValue({
      ...baseWarehouse,
      isActive: false,
    });

    const result = await service.deactivate('warehouse-1', 'acting-user');

    expect(prisma.warehouse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'warehouse-1' },
        data: { isActive: false },
      }),
    );
    expect(result.isActive).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEACTIVATE' }),
    );
  });

  it('throws BadRequestException when the warehouse still holds real stock', async () => {
    // El service solo mira si `having` (aplicado por Postgres de verdad)
    // devolvió alguna fila — el valor exacto de _sum acá no importa para
    // este test, solo que el grupo exista.
    prisma.stockMovement.groupBy.mockResolvedValue([
      { productId: 'product-1', _sum: { quantity: 5 } },
    ]);

    await expect(
      service.deactivate('warehouse-1', 'acting-user'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.warehouse.update).not.toHaveBeenCalled();
  });

  it('reactivates a warehouse by setting isActive to true and logs a REACTIVATE audit entry', async () => {
    prisma.warehouse.findUnique.mockResolvedValue({
      ...baseWarehouse,
      isActive: false,
    });
    prisma.warehouse.update.mockResolvedValue({
      ...baseWarehouse,
      isActive: true,
    });

    const result = await service.reactivate('warehouse-1', 'acting-user');

    expect(prisma.warehouse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'warehouse-1' },
        data: { isActive: true },
      }),
    );
    expect(result.isActive).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REACTIVATE' }),
    );
  });
});
