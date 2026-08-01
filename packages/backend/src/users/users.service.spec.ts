import { NotFoundException } from '@nestjs/common';
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

  it('strips the password from every user in findAll', async () => {
    prisma.user.findMany.mockResolvedValue([baseUser]);

    const result = await service.findAll();

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('password');
  });

  it('throws NotFoundException when findOne cannot find the user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws NotFoundException when updating a user that does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.update('missing', { name: 'New name' }, 'acting-user'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
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
