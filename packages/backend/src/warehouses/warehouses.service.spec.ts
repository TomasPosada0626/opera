import { NotFoundException } from '@nestjs/common';
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
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };
  let service: WarehousesService;

  beforeEach(() => {
    prisma = {
      warehouse: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
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

  it('lists all warehouses ordered by name', async () => {
    prisma.warehouse.findMany.mockResolvedValue([baseWarehouse]);

    const result = await service.findAll();

    expect(result).toEqual([baseWarehouse]);
    expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } }),
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
});
