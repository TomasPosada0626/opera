import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditService', () => {
  let prisma: { auditLog: { create: jest.Mock } };
  let service: AuditService;

  beforeEach(() => {
    prisma = { auditLog: { create: jest.fn() } };
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
});
