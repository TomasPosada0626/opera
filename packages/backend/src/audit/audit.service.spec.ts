import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditService', () => {
  let prisma: {
    auditLog: { create: jest.Mock; count: jest.Mock; findMany: jest.Mock };
  };
  let service: AuditService;

  beforeEach(() => {
    prisma = {
      auditLog: { create: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    };
    service = new AuditService(prisma as unknown as PrismaService);
  });

  it('creates an audit log entry with before/after snapshots', () => {
    const before = { name: 'Old' };
    const after = { name: 'New' };

    service.log({
      userId: 'user-1',
      entity: 'Product',
      entityId: 'product-1',
      action: 'UPDATE',
      before,
      after,
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        entity: 'Product',
        entityId: 'product-1',
        action: 'UPDATE',
        before: { name: 'Old' },
        after: { name: 'New' },
      },
    });
  });

  it('omits before/after when not provided (e.g. a CREATE action)', () => {
    service.log({
      userId: 'user-1',
      entity: 'Product',
      entityId: 'product-1',
      action: 'CREATE',
      after: { name: 'New' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        entity: 'Product',
        entityId: 'product-1',
        action: 'CREATE',
        before: undefined,
        after: { name: 'New' },
      },
    });
  });

  it("swallows a failed write instead of rejecting, so it never overrides the caller's real response", async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('connection lost'));

    await expect(
      service.log({
        userId: 'user-1',
        entity: 'Product',
        entityId: 'product-1',
        action: 'UPDATE',
        before: { name: 'Old' },
        after: { name: 'New' },
      }),
    ).resolves.toBeUndefined();
  });

  it('round-trips the snapshot through JSON so Date fields become plain values', () => {
    const before = { name: 'Old', createdAt: new Date('2026-01-01T00:00:00Z') };

    service.log({
      userId: 'user-1',
      entity: 'Product',
      entityId: 'product-1',
      action: 'UPDATE',
      before,
      after: undefined,
    });

    const [[createArgs]] = prisma.auditLog.create.mock.calls as [
      { data: { before: unknown } },
    ][];
    expect(createArgs.data.before).toEqual({
      name: 'Old',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  describe('query', () => {
    beforeEach(() => {
      prisma.auditLog.count.mockResolvedValue(0);
      prisma.auditLog.findMany.mockResolvedValue([]);
    });

    it('filters by entity, entityId, and userId when given', async () => {
      await service.query({
        entity: 'Order',
        entityId: 'order-1',
        userId: 'user-1',
        page: 1,
        pageSize: 20,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entity: 'Order', entityId: 'order-1', userId: 'user-1' },
          orderBy: { timestamp: 'desc' },
        }),
      );
    });

    it('builds a semi-open date range [from, to) when both are given', async () => {
      await service.query({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-02-01T00:00:00.000Z',
        page: 1,
        pageSize: 20,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            timestamp: {
              gte: new Date('2026-01-01T00:00:00.000Z'),
              lt: new Date('2026-02-01T00:00:00.000Z'),
            },
          },
        }),
      );
    });

    it('queries with an empty where clause when no filters are given', async () => {
      await service.query({ page: 1, pageSize: 20 });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('includes before/after (unlike getRecent) since this is for auditing a specific case', async () => {
      const entry = {
        id: 'log-1',
        entity: 'Order',
        entityId: 'order-1',
        action: 'UPDATE',
        before: { status: 'PENDIENTE' },
        after: { status: 'EN_PRODUCCION' },
        timestamp: new Date('2026-01-01'),
        user: { id: 'user-1', name: 'Admin' },
      };
      prisma.auditLog.count.mockResolvedValue(1);
      prisma.auditLog.findMany.mockResolvedValue([entry]);

      const result = await service.query({ page: 1, pageSize: 20 });

      expect(result.data).toEqual([entry]);
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { user: { select: { id: true, name: true } } },
        }),
      );
    });
  });
});
