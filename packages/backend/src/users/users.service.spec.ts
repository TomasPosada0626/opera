import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('UsersService', () => {
  const baseUser = {
    id: 'user-1',
    email: 'test@opera.local',
    name: 'Test User',
    password: 'hashed-password',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    roles: [],
  };

  let prisma: {
    user: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    audit = { log: jest.fn() };
    service = new UsersService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  it('hashes the password and never returns it, and logs a CREATE audit entry', async () => {
    prisma.user.create.mockResolvedValue(baseUser);

    const result = await service.create(
      {
        email: baseUser.email,
        name: baseUser.name,
        password: 'plain-text-password',
      },
      'acting-user',
    );

    const [[createArgs]] = prisma.user.create.mock.calls as [
      { data: { password: string } },
    ][];
    expect(createArgs.data.password).not.toBe('plain-text-password');
    expect(result).not.toHaveProperty('password');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entity: 'User',
        userId: 'acting-user',
      }),
    );
  });

  it('assigns roles on create when roleIds is provided', async () => {
    prisma.user.create.mockResolvedValue(baseUser);

    await service.create(
      {
        email: baseUser.email,
        name: baseUser.name,
        password: 'plain-text-password',
        roleIds: ['role-1', 'role-2'],
      },
      'acting-user',
    );

    const [[createArgs]] = prisma.user.create.mock.calls as [
      { data: { roles?: { create: { roleId: string }[] } } },
    ][];
    expect(createArgs.data.roles).toEqual({
      create: [{ roleId: 'role-1' }, { roleId: 'role-2' }],
    });
  });

  it('strips the password from every user in findAll', async () => {
    prisma.user.findMany.mockResolvedValue([baseUser]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.findAll({});

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).not.toHaveProperty('password');
  });

  it('paginates users and orders by name by default', async () => {
    prisma.user.findMany.mockResolvedValue([baseUser]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.findAll({});

    expect(result.meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('filters users by name or email when search is given', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.findAll({ search: 'test' });

    const expectedWhere = {
      OR: [
        { name: { contains: 'test', mode: 'insensitive' } },
        { email: { contains: 'test', mode: 'insensitive' } },
      ],
    };
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(prisma.user.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it('falls back to sorting by name when sortBy is not an allowed field', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.findAll({ sortBy: 'password', sortOrder: 'desc' });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'desc' } }),
    );
  });

  it('honors sortBy when it is an allowed field', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.findAll({ sortBy: 'email', sortOrder: 'desc' });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { email: 'desc' } }),
    );
  });

  it('throws NotFoundException when findOne cannot find the user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the user without a password when findOne finds it', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);

    const result = await service.findOne('user-1');

    expect(result).not.toHaveProperty('password');
    expect(result.id).toBe('user-1');
  });

  it('throws NotFoundException when updating a user that does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.update('missing', { name: 'New name' }, 'acting-user'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('updates a user and logs an UPDATE audit entry with before/after', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue({
      ...baseUser,
      name: 'Updated Name',
    });

    const result = await service.update(
      'user-1',
      { name: 'Updated Name' },
      'acting-user',
    );

    const [[updateArgs]] = prisma.user.update.mock.calls as [
      { where: { id: string }; data: { name?: string } },
    ][];
    expect(updateArgs.where).toEqual({ id: 'user-1' });
    expect(updateArgs.data.name).toBe('Updated Name');
    expect(result.name).toBe('Updated Name');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entity: 'User' }),
    );
  });

  it('replaces roles on update when roleIds is provided', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue(baseUser);

    await service.update('user-1', { roleIds: ['role-3'] }, 'acting-user');

    const [[updateArgs]] = prisma.user.update.mock.calls as [
      {
        data: { roles?: { deleteMany: object; create: { roleId: string }[] } };
      },
    ][];
    expect(updateArgs.data.roles).toEqual({
      deleteMany: {},
      create: [{ roleId: 'role-3' }],
    });
  });

  it('deactivates a user by setting isActive to false and logs a DEACTIVATE audit entry', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue({ ...baseUser, isActive: false });

    const result = await service.deactivate('user-1', 'acting-user');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { isActive: false },
      }),
    );
    expect(result.isActive).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEACTIVATE' }),
    );
  });

  it('refuses to let a user deactivate their own account', async () => {
    await expect(
      service.deactivate('acting-user', 'acting-user'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when deactivating a user that does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.deactivate('missing', 'acting-user'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('anonymizes a user by redacting name/email and deactivating it, logging only "after"', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...baseUser, ...data }),
    );

    const result = await service.anonymize('user-1', 'acting-user');

    expect(result.name).toBe('Usuario eliminado');
    expect(result.email).toMatch(/^usuario-eliminado-.+@opera\.local$/);
    expect(result.isActive).toBe(false);
    expect(result).not.toHaveProperty('password');

    const [[auditArgs]] = audit.log.mock.calls as [Record<string, unknown>][];
    expect(auditArgs).toEqual(
      expect.objectContaining({
        userId: 'acting-user',
        entity: 'User',
        entityId: 'user-1',
        action: 'ANONYMIZE',
      }),
    );
    const after = auditArgs.after as { name: string; isActive: boolean };
    expect(after.name).toBe('Usuario eliminado');
    expect(after.isActive).toBe(false);
    expect(auditArgs).not.toHaveProperty('before');
  });

  it('refuses to let a user anonymize their own account', async () => {
    await expect(
      service.anonymize('acting-user', 'acting-user'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when anonymizing a user that does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.anonymize('missing', 'acting-user'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when resetting the password of a user that does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.resetPassword(
        'missing',
        { newPassword: 'brand-new-password' },
        'acting-user',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('hashes the new password and never logs it in the audit trail', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue(baseUser);

    const result = await service.resetPassword(
      'user-1',
      { newPassword: 'brand-new-password' },
      'acting-user',
    );

    const [[updateArgs]] = prisma.user.update.mock.calls as [
      { data: { password: string } },
    ][];
    expect(updateArgs.data.password).not.toBe('brand-new-password');
    expect(result).not.toHaveProperty('password');

    const [[auditArgs]] = audit.log.mock.calls as [Record<string, unknown>][];
    expect(auditArgs).toEqual(
      expect.objectContaining({
        action: 'PASSWORD_RESET',
        entity: 'User',
        userId: 'acting-user',
      }),
    );
    expect(auditArgs).not.toHaveProperty('before');
    expect(auditArgs).not.toHaveProperty('after');
  });
});
