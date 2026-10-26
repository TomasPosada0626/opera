import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Workbook } from 'exceljs';
import { CustomersService } from './customers.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// Mismo patrón que reports.service.spec.ts: carga el buffer de vuelta con
// exceljs y lee celdas reales en vez de confiar en que el buffer "existe".
async function readSheet(buffer: Buffer, sheetName: string) {
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }
  return sheet;
}

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
    remission: { aggregate: jest.Mock };
    remissionPayment: { findMany: jest.Mock };
    order: { findMany: jest.Mock };
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
      remission: { aggregate: jest.fn() },
      remissionPayment: { findMany: jest.fn() },
      order: { findMany: jest.fn() },
    };
    audit = { log: jest.fn() };
    service = new CustomersService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
    prisma.customer.findUnique.mockResolvedValue(baseCustomer);
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

  it('reactivates a customer by setting isActive to true and logs a REACTIVATE audit entry', async () => {
    prisma.customer.findUnique.mockResolvedValue({
      ...baseCustomer,
      isActive: false,
    });
    prisma.customer.update.mockResolvedValue({
      ...baseCustomer,
      isActive: true,
    });

    const result = await service.reactivate('customer-1', 'acting-user');

    expect(prisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'customer-1' },
        data: { isActive: true },
      }),
    );
    expect(result.isActive).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REACTIVATE' }),
    );
  });

  it('anonymizes a customer by redacting PII and deactivating it, logging only "after"', async () => {
    prisma.customer.findUnique.mockResolvedValue(baseCustomer);
    const anonymized = {
      ...baseCustomer,
      name: 'Cliente eliminado',
      taxId: null,
      email: null,
      phone: null,
      address: null,
      isActive: false,
    };
    prisma.customer.update.mockResolvedValue(anonymized);

    const result = await service.anonymize('customer-1', 'acting-user');

    expect(prisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'customer-1' },
        data: {
          name: 'Cliente eliminado',
          taxId: null,
          email: null,
          phone: null,
          address: null,
          mobile: null,
          isActive: false,
        },
      }),
    );
    expect(result).toEqual(anonymized);
    // Objeto exacto (no objectContaining): también prueba que nunca se
    // filtra un "before" con la PII real al audit trail -- ese es el punto
    // entero del hallazgo #15.
    expect(audit.log).toHaveBeenCalledWith({
      userId: 'acting-user',
      entity: 'Customer',
      entityId: 'customer-1',
      action: 'ANONYMIZE',
      after: anonymized,
    });
  });

  it('throws NotFoundException when anonymizing a customer that does not exist', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);

    await expect(
      service.anonymize('missing', 'acting-user'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  describe('getBalance', () => {
    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(service.getBalance('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.remission.aggregate).not.toHaveBeenCalled();
    });

    it('returns zero for a customer with no remissions', async () => {
      prisma.remission.aggregate.mockResolvedValue({
        _sum: { total: null, amountPaid: null },
      });

      const result = await service.getBalance('customer-1');

      expect(result).toEqual({
        totalBilled: '0',
        totalPaid: '0',
        balance: '0',
      });
    });

    it('subtracts what was paid from what was dispatched', async () => {
      prisma.remission.aggregate.mockResolvedValue({
        _sum: {
          total: new Prisma.Decimal(210),
          amountPaid: new Prisma.Decimal(130),
        },
      });

      const result = await service.getBalance('customer-1');

      expect(result).toEqual({
        totalBilled: '210',
        totalPaid: '130',
        balance: '80',
      });
    });

    it('only counts non-voided remissions (a voided one is never charged)', async () => {
      prisma.remission.aggregate.mockResolvedValue({
        _sum: { total: null, amountPaid: null },
      });

      await service.getBalance('customer-1');

      expect(prisma.remission.aggregate).toHaveBeenCalledWith({
        where: { order: { customerId: 'customer-1' }, voidedAt: null },
        _sum: { total: true, amountPaid: true },
      });
    });
  });

  describe('getPayments', () => {
    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(service.getPayments('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.remissionPayment.findMany).not.toHaveBeenCalled();
    });

    it('lists every payment across the customer remissions, newest first', async () => {
      prisma.remissionPayment.findMany.mockResolvedValue([{ id: 'payment-1' }]);

      const result = await service.getPayments('customer-1');

      expect(result).toEqual([{ id: 'payment-1' }]);
      expect(prisma.remissionPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { remission: { order: { customerId: 'customer-1' } } },
          orderBy: { paidAt: 'desc' },
        }),
      );
    });
  });

  describe('exportExcel', () => {
    it('writes the profile and order history to their own sheets', async () => {
      prisma.customer.findUnique.mockResolvedValue(baseCustomer);
      prisma.order.findMany.mockResolvedValue([
        {
          number: 31,
          createdAt: new Date('2026-02-01'),
          status: 'EN_ALMACEN',
          items: [
            {
              quantity: new Prisma.Decimal(2),
              unitPrice: new Prisma.Decimal(50),
            },
          ],
        },
      ]);

      const buffer = await service.exportExcel('customer-1');

      const profileSheet = await readSheet(buffer, 'Cliente');
      expect(profileSheet.getRow(2).getCell(1).value).toBe('Nombre');
      expect(profileSheet.getRow(2).getCell(2).value).toBe(baseCustomer.name);

      const ordersSheet = await readSheet(buffer, 'Pedidos');
      expect(ordersSheet.getRow(2).getCell(1).value).toBe(31);
      expect(ordersSheet.getRow(2).getCell(3).value).toBe('EN_ALMACEN');
      expect(ordersSheet.getRow(2).getCell(4).value).toBe(1);
      expect(ordersSheet.getRow(2).getCell(5).value).toBe(100);
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { customerId: 'customer-1' } }),
      );
    });

    it('writes empty strings for null optional fields instead of literal "null"', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        ...baseCustomer,
        taxId: null,
        email: null,
        phone: null,
        address: null,
      });
      prisma.order.findMany.mockResolvedValue([]);

      const buffer = await service.exportExcel('customer-1');

      const profileSheet = await readSheet(buffer, 'Cliente');
      const rows = profileSheet.getRows(1, profileSheet.rowCount) ?? [];
      const taxIdRow = rows.find((row) => row.getCell(1).value === 'NIT');
      expect(taxIdRow?.getCell(2).value).toBe('');
    });

    it('throws NotFoundException when exporting a customer that does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(service.exportExcel('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });
  });
});
