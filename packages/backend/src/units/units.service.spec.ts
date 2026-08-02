import { NotFoundException } from '@nestjs/common';
import { UnitsService } from './units.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('UnitsService', () => {
  const baseUnit = {
    id: 'unit-1',
    name: 'Kilogramo',
    abbreviation: 'kg',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  let prisma: {
    unit: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };
  let service: UnitsService;

  beforeEach(() => {
    prisma = {
      unit: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    audit = { log: jest.fn() };
    service = new UnitsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  it('creates a unit and logs a CREATE audit entry', async () => {
    prisma.unit.create.mockResolvedValue(baseUnit);

    const result = await service.create(
      { name: 'Kilogramo', abbreviation: 'kg' },
      'acting-user',
    );

    expect(result).toEqual(baseUnit);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entity: 'Unit',
        userId: 'acting-user',
      }),
    );
  });

  it('throws NotFoundException when findOne cannot find the unit', async () => {
    prisma.unit.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deactivates a unit by setting isActive to false and logs a DEACTIVATE audit entry', async () => {
    prisma.unit.findUnique.mockResolvedValue(baseUnit);
    prisma.unit.update.mockResolvedValue({ ...baseUnit, isActive: false });

    const result = await service.deactivate('unit-1', 'acting-user');

    expect(result.isActive).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEACTIVATE' }),
    );
  });
});
