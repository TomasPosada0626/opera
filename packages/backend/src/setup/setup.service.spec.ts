import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SetupService } from './setup.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('SetupService', () => {
  const createdUser = {
    id: 'admin-1',
    email: 'admin@opera.local',
    name: 'Admin',
    roles: [{ role: { name: 'ADMIN', permissions: [] } }],
  };

  let prisma: {
    user: { count: jest.Mock; create: jest.Mock };
    role: { upsert: jest.Mock };
    warehouse: { upsert: jest.Mock };
  };
  let jwt: { signAsync: jest.Mock };
  let audit: { log: jest.Mock };
  let service: SetupService;

  beforeEach(() => {
    prisma = {
      user: { count: jest.fn(), create: jest.fn() },
      role: { upsert: jest.fn() },
      warehouse: { upsert: jest.fn() },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };
    audit = { log: jest.fn() };
    service = new SetupService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      audit as unknown as AuditService,
    );
  });

  describe('needsSetup', () => {
    it('is true when there are no users', async () => {
      prisma.user.count.mockResolvedValue(0);
      await expect(service.needsSetup()).resolves.toBe(true);
    });

    it('is false when at least one user already exists', async () => {
      prisma.user.count.mockResolvedValue(1);
      await expect(service.needsSetup()).resolves.toBe(false);
    });
  });

  describe('createAdmin', () => {
    it('refuses when a user already exists, without writing anything', async () => {
      prisma.user.count.mockResolvedValue(1);

      await expect(
        service.createAdmin({
          email: 'otro@opera.local',
          name: 'Otro',
          password: 'Password-123!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.role.upsert).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.warehouse.upsert).not.toHaveBeenCalled();
    });

    it('creates the ADMIN role, the user, the main warehouse, logs the bootstrap, and returns a signed JWT', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.role.upsert.mockResolvedValue({ id: 'role-1', name: 'ADMIN' });
      prisma.user.create.mockResolvedValue(createdUser);
      prisma.warehouse.upsert.mockResolvedValue({
        id: 'wh-1',
        name: 'Bodega principal',
      });

      const result = await service.createAdmin({
        email: 'admin@opera.local',
        name: 'Admin',
        password: 'Password-123!',
      });

      expect(prisma.role.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { name: 'ADMIN' } }),
      );

      const [[createArgs]] = prisma.user.create.mock.calls as [
        {
          data: {
            email: string;
            password: string;
            roles: { create: { roleId: string } };
          };
        },
      ][];
      expect(createArgs.data.email).toBe('admin@opera.local');
      expect(createArgs.data.password).not.toBe('Password-123!');
      expect(createArgs.data.roles).toEqual({ create: { roleId: 'role-1' } });

      expect(prisma.warehouse.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { name: 'Bodega principal' } }),
      );

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          entity: 'User',
          entityId: 'admin-1',
          action: 'BOOTSTRAP_ADMIN',
        }),
      );

      expect(jwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'admin-1',
          email: 'admin@opera.local',
          roles: ['ADMIN'],
          permissions: [],
        }),
      );
      expect(result).toEqual({ accessToken: 'signed-jwt' });
    });
  });
});
