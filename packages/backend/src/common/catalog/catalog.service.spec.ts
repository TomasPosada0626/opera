import { NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { CatalogService } from './catalog.service';

// Entidad mínima ficticia — este spec no le pertenece a ningún módulo real,
// existe para probar la base compartida directamente (antes solo se probaba
// indirectamente a través de cada subclase concreta, dejando sin cobertura
// dedicada ramas como buildSearchWhere con 0/1/N campos o el `include`
// propagado en cada operación).
interface FakeEntity {
  id: string;
  name: string;
  code: string;
}

const fakeDelegate = {
  create: jest.fn(),
  count: jest.fn(),
  findMany: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};

class NoSearchCatalogService extends CatalogService<
  FakeEntity,
  { name: string },
  { name?: string }
> {
  constructor(audit: AuditService) {
    super(fakeDelegate, audit, {
      entityName: 'FakeEntity',
      notFoundMessage: 'No encontrado',
      searchFields: [],
      sortableFields: ['name'] as const,
      defaultSortField: 'name',
    });
  }
}

class SingleFieldCatalogService extends CatalogService<
  FakeEntity,
  { name: string },
  { name?: string }
> {
  constructor(audit: AuditService) {
    super(fakeDelegate, audit, {
      entityName: 'FakeEntity',
      notFoundMessage: 'No encontrado',
      searchFields: ['name'],
      sortableFields: ['name'] as const,
      defaultSortField: 'name',
      include: { owner: true },
    });
  }
}

class MultiFieldCatalogService extends CatalogService<
  FakeEntity,
  { name: string },
  { name?: string }
> {
  constructor(audit: AuditService) {
    super(fakeDelegate, audit, {
      entityName: 'FakeEntity',
      notFoundMessage: 'No encontrado',
      searchFields: ['name', 'code'],
      sortableFields: ['name'] as const,
      defaultSortField: 'name',
    });
  }
}

describe('CatalogService', () => {
  const baseEntity: FakeEntity = {
    id: 'entity-1',
    name: 'Original',
    code: 'ORG',
  };

  let audit: { log: jest.Mock };

  beforeEach(() => {
    jest.resetAllMocks();
    audit = { log: jest.fn() };
  });

  describe('buildSearchWhere via findAll', () => {
    it('returns an empty where when the entity has no searchFields, even if search is given', async () => {
      const service = new NoSearchCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.findMany.mockResolvedValue([]);
      fakeDelegate.count.mockResolvedValue(0);

      await service.findAll({ search: 'anything' });

      expect(fakeDelegate.count).toHaveBeenCalledWith({ where: {} });
      expect(fakeDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('returns an empty where when search is not given', async () => {
      const service = new SingleFieldCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.findMany.mockResolvedValue([]);
      fakeDelegate.count.mockResolvedValue(0);

      await service.findAll({});

      expect(fakeDelegate.count).toHaveBeenCalledWith({ where: {} });
    });

    it('builds a direct field filter (no OR) when there is exactly one searchField', async () => {
      const service = new SingleFieldCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.findMany.mockResolvedValue([]);
      fakeDelegate.count.mockResolvedValue(0);

      await service.findAll({ search: 'foo' });

      expect(fakeDelegate.count).toHaveBeenCalledWith({
        where: { name: { contains: 'foo', mode: 'insensitive' } },
      });
    });

    it('builds an OR filter across all searchFields when there is more than one', async () => {
      const service = new MultiFieldCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.findMany.mockResolvedValue([]);
      fakeDelegate.count.mockResolvedValue(0);

      await service.findAll({ search: 'foo' });

      expect(fakeDelegate.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: 'foo', mode: 'insensitive' } },
            { code: { contains: 'foo', mode: 'insensitive' } },
          ],
        },
      });
    });
  });

  describe('include propagation', () => {
    it('passes options.include through create, findAll, findOne and update', async () => {
      const service = new SingleFieldCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.create.mockResolvedValue(baseEntity);
      fakeDelegate.findMany.mockResolvedValue([baseEntity]);
      fakeDelegate.count.mockResolvedValue(1);
      fakeDelegate.findUnique.mockResolvedValue(baseEntity);
      fakeDelegate.update.mockResolvedValue({ ...baseEntity, name: 'New' });

      await service.create({ name: 'Original' }, 'user-1');
      await service.findAll({});
      await service.findOne('entity-1');
      await service.update('entity-1', { name: 'New' }, 'user-1');

      expect(fakeDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({ include: { owner: true } }),
      );
      expect(fakeDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ include: { owner: true } }),
      );
      expect(fakeDelegate.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ include: { owner: true } }),
      );
      expect(fakeDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({ include: { owner: true } }),
      );
    });
  });

  describe('create', () => {
    it('logs a CREATE audit entry with only "after" (no before)', async () => {
      const service = new MultiFieldCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.create.mockResolvedValue(baseEntity);

      const result = await service.create({ name: 'Original' }, 'user-1');

      expect(result).toEqual(baseEntity);
      expect(audit.log).toHaveBeenCalledWith({
        userId: 'user-1',
        entity: 'FakeEntity',
        entityId: baseEntity.id,
        action: 'CREATE',
        after: baseEntity,
      });
    });
  });

  describe('findOne', () => {
    it('throws the configured notFoundMessage when the delegate returns null', async () => {
      const service = new MultiFieldCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        new NotFoundException('No encontrado'),
      );
    });
  });

  describe('update', () => {
    it('reads the entity first, then logs UPDATE with before and after', async () => {
      const service = new MultiFieldCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.findUnique.mockResolvedValue(baseEntity);
      const updated = { ...baseEntity, name: 'Updated' };
      fakeDelegate.update.mockResolvedValue(updated);

      const result = await service.update(
        'entity-1',
        { name: 'Updated' },
        'user-1',
      );

      expect(result).toEqual(updated);
      expect(audit.log).toHaveBeenCalledWith({
        userId: 'user-1',
        entity: 'FakeEntity',
        entityId: baseEntity.id,
        action: 'UPDATE',
        before: baseEntity,
        after: updated,
      });
    });

    it('propagates NotFoundException and never calls update when the entity does not exist', async () => {
      const service = new MultiFieldCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing', { name: 'X' }, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fakeDelegate.update).not.toHaveBeenCalled();
    });
  });

  describe('deactivate / reactivate', () => {
    it('deactivate sets isActive false and logs a DEACTIVATE audit entry with before/after', async () => {
      const service = new MultiFieldCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.findUnique.mockResolvedValue(baseEntity);
      const deactivated = { ...baseEntity, isActive: false };
      fakeDelegate.update.mockResolvedValue(deactivated);

      const result = await service.deactivate('entity-1', 'user-1');

      expect(fakeDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'entity-1' },
          data: { isActive: false },
        }),
      );
      expect(result).toEqual(deactivated);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DEACTIVATE',
          before: baseEntity,
          after: deactivated,
        }),
      );
    });

    it('reactivate sets isActive true and logs a REACTIVATE audit entry', async () => {
      const service = new MultiFieldCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.findUnique.mockResolvedValue({
        ...baseEntity,
        isActive: false,
      });
      const reactivated = { ...baseEntity, isActive: true };
      fakeDelegate.update.mockResolvedValue(reactivated);

      const result = await service.reactivate('entity-1', 'user-1');

      expect(fakeDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'entity-1' },
          data: { isActive: true },
        }),
      );
      expect(result).toEqual(reactivated);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REACTIVATE' }),
      );
    });

    it('deactivate propagates NotFoundException without calling update when missing', async () => {
      const service = new MultiFieldCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.findUnique.mockResolvedValue(null);

      await expect(
        service.deactivate('missing', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fakeDelegate.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll pagination', () => {
    it('defaults to page 1, pageSize 20 and returns the paginated envelope', async () => {
      const service = new MultiFieldCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.findMany.mockResolvedValue([baseEntity]);
      fakeDelegate.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result).toEqual({
        data: [baseEntity],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });
      expect(fakeDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('computes skip from page/pageSize for later pages', async () => {
      const service = new MultiFieldCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.findMany.mockResolvedValue([]);
      fakeDelegate.count.mockResolvedValue(45);

      const result = await service.findAll({ page: 3, pageSize: 10 });

      expect(fakeDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result.meta).toEqual({
        page: 3,
        pageSize: 10,
        total: 45,
        totalPages: 5,
      });
    });

    it('falls back to defaultSortField when sortBy is not in sortableFields', async () => {
      const service = new MultiFieldCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.findMany.mockResolvedValue([]);
      fakeDelegate.count.mockResolvedValue(0);

      await service.findAll({ sortBy: 'code', sortOrder: 'desc' });

      expect(fakeDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'desc' } }),
      );
    });

    it('honors sortBy when it is in sortableFields', async () => {
      const service = new MultiFieldCatalogService(
        audit as unknown as AuditService,
      );
      fakeDelegate.findMany.mockResolvedValue([]);
      fakeDelegate.count.mockResolvedValue(0);

      await service.findAll({ sortBy: 'name', sortOrder: 'desc' });

      expect(fakeDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'desc' } }),
      );
    });
  });
});
