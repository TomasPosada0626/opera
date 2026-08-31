import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Workbook } from 'exceljs';
import { SuppliersService } from './suppliers.service';
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
    supplierProduct: { findMany: jest.Mock };
    supplierPurchase: { findMany: jest.Mock };
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
      supplierProduct: { findMany: jest.fn() },
      supplierPurchase: { findMany: jest.fn() },
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

  describe('exportExcel', () => {
    it('writes the profile, price list and purchase history to their own sheets', async () => {
      prisma.supplier.findUnique.mockResolvedValue(baseSupplier);
      prisma.supplierProduct.findMany.mockResolvedValue([
        {
          price: new Prisma.Decimal(125.5),
          product: { sku: 'SKU-1', name: 'Tabla de pino' },
        },
      ]);
      prisma.supplierPurchase.findMany.mockResolvedValue([
        {
          purchasedAt: new Date('2026-02-01'),
          quantity: new Prisma.Decimal(10),
          unitCost: new Prisma.Decimal(12),
          receivedAt: new Date('2026-02-03'),
          product: { sku: 'SKU-1', name: 'Tabla de pino' },
        },
      ]);

      const buffer = await service.exportExcel('supplier-1');

      const profileSheet = await readSheet(buffer, 'Proveedor');
      expect(profileSheet.getRow(2).getCell(2).value).toBe(baseSupplier.name);

      const pricesSheet = await readSheet(buffer, 'Precios');
      expect(pricesSheet.getRow(2).getCell(1).value).toBe('SKU-1');
      expect(pricesSheet.getRow(2).getCell(3).value).toBe(125.5);

      const purchasesSheet = await readSheet(buffer, 'Compras');
      expect(purchasesSheet.getRow(2).getCell(4).value).toBe(10);
      expect(purchasesSheet.getRow(2).getCell(6).value).toBe('Sí');

      expect(prisma.supplierProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { supplierId: 'supplier-1' } }),
      );
      expect(prisma.supplierPurchase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { supplierId: 'supplier-1' } }),
      );
    });

    it('marks an unreceived purchase as "No" and writes empty strings for null optional fields', async () => {
      prisma.supplier.findUnique.mockResolvedValue({
        ...baseSupplier,
        taxId: null,
        email: null,
        phone: null,
        address: null,
      });
      prisma.supplierProduct.findMany.mockResolvedValue([]);
      prisma.supplierPurchase.findMany.mockResolvedValue([
        {
          purchasedAt: new Date('2026-02-01'),
          quantity: new Prisma.Decimal(5),
          unitCost: new Prisma.Decimal(8),
          receivedAt: null,
          product: { sku: 'SKU-2', name: 'Tornillos' },
        },
      ]);

      const buffer = await service.exportExcel('supplier-1');

      const profileSheet = await readSheet(buffer, 'Proveedor');
      const rows = profileSheet.getRows(1, profileSheet.rowCount) ?? [];
      const taxIdRow = rows.find((row) => row.getCell(1).value === 'NIT');
      expect(taxIdRow?.getCell(2).value).toBe('');

      const purchasesSheet = await readSheet(buffer, 'Compras');
      expect(purchasesSheet.getRow(2).getCell(6).value).toBe('No');
    });

    it('throws NotFoundException when exporting a supplier that does not exist', async () => {
      prisma.supplier.findUnique.mockResolvedValue(null);

      await expect(service.exportExcel('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.supplierProduct.findMany).not.toHaveBeenCalled();
    });
  });
});
