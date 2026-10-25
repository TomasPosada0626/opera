import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BillOfMaterialsService } from './bill-of-materials.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('BillOfMaterialsService', () => {
  const chair = {
    id: 'chair',
    name: 'Silla',
    type: 'FINISHED_GOOD',
    isActive: true,
  };
  const wood = {
    id: 'wood',
    name: 'Tabla',
    type: 'RAW_MATERIAL',
    isActive: true,
  };
  const screw = {
    id: 'screw',
    name: 'Tornillo',
    type: 'SUPPLY',
    isActive: true,
  };

  let prisma: {
    product: { findUnique: jest.Mock; findMany: jest.Mock };
    billOfMaterials: { findUnique: jest.Mock; delete: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let service: BillOfMaterialsService;
  let tx: {
    billOfMaterials: { upsert: jest.Mock; findUniqueOrThrow: jest.Mock };
    billOfMaterialsItem: { deleteMany: jest.Mock; createMany: jest.Mock };
  };

  beforeEach(() => {
    tx = {
      billOfMaterials: {
        upsert: jest.fn().mockResolvedValue({ id: 'bom-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'bom-1',
          productId: chair.id,
          items: [
            { componentId: 'wood', quantity: new Prisma.Decimal(3) },
            { componentId: 'screw', quantity: new Prisma.Decimal(8) },
          ],
        }),
      },
      billOfMaterialsItem: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    prisma = {
      product: { findUnique: jest.fn(), findMany: jest.fn() },
      billOfMaterials: { findUnique: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn((callback: (stub: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    audit = { log: jest.fn() };
    service = new BillOfMaterialsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );

    prisma.product.findUnique.mockResolvedValue(chair);
    prisma.product.findMany.mockResolvedValue([wood, screw]);
    prisma.billOfMaterials.findUnique.mockResolvedValue(null);
  });

  const items = [
    { componentId: 'wood', quantity: 3 },
    { componentId: 'screw', quantity: 8 },
  ];

  describe('findByProduct', () => {
    it('throws NotFoundException for an unknown product', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.findByProduct('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns an empty list (not an error) when the product has none yet', async () => {
      const result = await service.findByProduct(chair.id);

      expect(result).toEqual({
        id: null,
        productId: chair.id,
        isActive: false,
        items: [],
      });
    });

    it('returns the saved list with its components', async () => {
      const bom = { id: 'bom-1', productId: chair.id, items: [] };
      prisma.billOfMaterials.findUnique.mockResolvedValue(bom);

      await expect(service.findByProduct(chair.id)).resolves.toBe(bom);
    });
  });

  describe('upsert', () => {
    it('only lets finished goods have a list', async () => {
      prisma.product.findUnique.mockResolvedValue(wood);

      await expect(service.upsert(wood.id, { items }, 'admin')).rejects.toThrow(
        'Solo un producto terminado',
      );
    });

    it('rejects a deactivated product', async () => {
      prisma.product.findUnique.mockResolvedValue({
        ...chair,
        isActive: false,
      });

      await expect(
        service.upsert(chair.id, { items }, 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects the same material twice', async () => {
      await expect(
        service.upsert(
          chair.id,
          {
            items: [
              { componentId: 'wood', quantity: 1 },
              { componentId: 'wood', quantity: 2 },
            ],
          },
          'admin',
        ),
      ).rejects.toThrow('dos veces');
    });

    it('rejects the product as its own material', async () => {
      await expect(
        service.upsert(
          chair.id,
          { items: [{ componentId: chair.id, quantity: 1 }] },
          'admin',
        ),
      ).rejects.toThrow('sí mismo');
    });

    it('rejects a material that does not exist', async () => {
      prisma.product.findMany.mockResolvedValue([wood]);

      await expect(
        service.upsert(chair.id, { items }, 'admin'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a finished good as a material', async () => {
      prisma.product.findMany.mockResolvedValue([
        wood,
        { ...screw, type: 'FINISHED_GOOD' },
      ]);

      await expect(
        service.upsert(chair.id, { items }, 'admin'),
      ).rejects.toThrow('solo admite materias primas e insumos');
    });

    it('rejects a deactivated material', async () => {
      prisma.product.findMany.mockResolvedValue([
        wood,
        { ...screw, isActive: false },
      ]);

      await expect(
        service.upsert(chair.id, { items }, 'admin'),
      ).rejects.toThrow('Tornillo está desactivado');
    });

    it('creates the list, replacing every line inside one transaction, and logs CREATE', async () => {
      const result = await service.upsert(chair.id, { items }, 'admin');

      expect(tx.billOfMaterials.upsert).toHaveBeenCalledWith({
        where: { productId: chair.id },
        create: { productId: chair.id, isActive: true },
        update: { isActive: true },
      });
      expect(tx.billOfMaterialsItem.deleteMany).toHaveBeenCalledWith({
        where: { billOfMaterialsId: 'bom-1' },
      });
      expect(tx.billOfMaterialsItem.createMany).toHaveBeenCalledWith({
        data: [
          { billOfMaterialsId: 'bom-1', componentId: 'wood', quantity: 3 },
          { billOfMaterialsId: 'bom-1', componentId: 'screw', quantity: 8 },
        ],
      });
      expect(result.id).toBe('bom-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'BillOfMaterials',
          action: 'CREATE',
          before: undefined,
        }),
      );
    });

    it('logs UPDATE with the previous lines when the list already existed', async () => {
      prisma.billOfMaterials.findUnique.mockResolvedValue({
        id: 'bom-1',
        items: [{ componentId: 'wood', quantity: new Prisma.Decimal(2) }],
      });

      await service.upsert(chair.id, { items }, 'admin');

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          before: {
            productId: chair.id,
            items: [{ componentId: 'wood', quantity: new Prisma.Decimal(2) }],
          },
        }),
      );
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the product has no list', async () => {
      await expect(service.remove(chair.id, 'admin')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.billOfMaterials.delete).not.toHaveBeenCalled();
    });

    it('deletes the list and logs DELETE with what it had', async () => {
      prisma.billOfMaterials.findUnique.mockResolvedValue({
        id: 'bom-1',
        items: [{ componentId: 'wood', quantity: new Prisma.Decimal(3) }],
      });

      const result = await service.remove(chair.id, 'admin');

      expect(prisma.billOfMaterials.delete).toHaveBeenCalledWith({
        where: { id: 'bom-1' },
      });
      expect(result).toEqual({ productId: chair.id, deleted: true });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', entityId: 'bom-1' }),
      );
    });
  });
});
