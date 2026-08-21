import { NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('CustomersService', () => {
  const baseCustomer = {
    id: 'customer-1',
    name: 'Muebles del Valle S.A.S.',
    taxId: '900123456-1',
    email: 'compras@mueblesdelvalle.test',
    phone: '3001234567',
    address: 'Calle 45 #12-34',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  let prisma: {
    customer: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };
  let service: CustomersService;

  beforeEach(() => {
    prisma = {
      customer: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    audit = { log: jest.fn() };
    service = new CustomersService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  it('creates a customer and logs a CREATE audit entry', async () => {
    prisma.customer.create.mockResolvedValue(baseCustomer);

    const result = await service.create(
      { name: 'Muebles del Valle S.A.S.' },
      'acting-user',
    );

    expect(result).toEqual(baseCustomer);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entity: 'Customer',
        userId: 'acting-user',
      }),
    );
  });

  it('lists customers paginated and ordered by name by default', async () => {
    prisma.customer.findMany.mockResolvedValue([baseCustomer]);
    prisma.customer.count.mockResolvedValue(1);

    const result = await service.findAll({});

    expect(result).toEqual({
      data: [baseCustomer],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('filters customers by name when search is given', async () => {
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.customer.count.mockResolvedValue(0);

    await service.findAll({ search: 'valle' });

    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'valle', mode: 'insensitive' } },
      }),
    );
    expect(prisma.customer.count).toHaveBeenCalledWith({
      where: { name: { contains: 'valle', mode: 'insensitive' } },
    });
  });

  it('falls back to sorting by name when sortBy is not an allowed field', async () => {
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.customer.count.mockResolvedValue(0);

    await service.findAll({ sortBy: 'taxId', sortOrder: 'desc' });

    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'desc' } }),
    );
  });

  it('throws NotFoundException when findOne cannot find the customer', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws NotFoundException when updating a customer that does not exist', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);

    await expect(
      service.update('missing', { name: 'New name' }, 'acting-user'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('updates a customer and logs an UPDATE audit entry with before/after', async () => {
    prisma.customer.findUnique.mockResolvedValue(baseCustomer);
    prisma.customer.update.mockResolvedValue({
      ...baseCustomer,
      phone: '3009876543',
    });

    const result = await service.update(
      'customer-1',
      { phone: '3009876543' },
      'acting-user',
    );

    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      data: { phone: '3009876543' },
    });
    expect(result.phone).toBe('3009876543');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entity: 'Customer',
        before: baseCustomer,
      }),
    );
  });

  it('deactivates a customer by setting isActive to false and logs a DEACTIVATE audit entry', async () => {
    prisma.customer.findUnique.mockResolvedValue(baseCustomer);
    prisma.customer.update.mockResolvedValue({
      ...baseCustomer,
      isActive: false,
    });

    const result = await service.deactivate('customer-1', 'acting-user');

    expect(prisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'customer-1' },
        data: { isActive: false },
      }),
    );
    expect(result.isActive).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEACTIVATE' }),
    );
  });
});
