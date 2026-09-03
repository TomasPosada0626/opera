import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
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

  let txUser: { count: jest.Mock; create: jest.Mock };
  let txRole: { upsert: jest.Mock };
  let txWarehouse: { upsert: jest.Mock };
  let prisma: {
    user: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwt: { signAsync: jest.Mock };
  let audit: { log: jest.Mock };
  let service: SetupService;

  beforeEach(() => {
    txUser = { count: jest.fn(), create: jest.fn() };
    txRole = { upsert: jest.fn() };
    txWarehouse = { upsert: jest.fn() };
    prisma = {
      user: { count: jest.fn() },
      // Mismo patrón que inventory.service.spec.ts para transacciones
      // Serializable: el callback recibe el mismo set de mocks que
      // createAdmin() usa como `tx`.
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({ user: txUser, role: txRole, warehouse: txWarehouse }),
      ),
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
      txUser.count.mockResolvedValue(1);

      await expect(
        service.createAdmin({
          email: 'otro@opera.local',
          name: 'Otro',
          password: 'Password-123!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(txRole.upsert).not.toHaveBeenCalled();
      expect(txUser.create).not.toHaveBeenCalled();
      expect(txWarehouse.upsert).not.toHaveBeenCalled();
    });

    it('creates the ADMIN role, the user, the main warehouse, logs the bootstrap, and returns a signed JWT', async () => {
      txUser.count.mockResolvedValue(0);
      txRole.upsert.mockResolvedValue({ id: 'role-1', name: 'ADMIN' });
      txUser.create.mockResolvedValue(createdUser);
      txWarehouse.upsert.mockResolvedValue({
        id: 'wh-1',
        name: 'Bodega principal',
      });

      const result = await service.createAdmin({
        email: 'admin@opera.local',
        name: 'Admin',
        password: 'Password-123!',
      });

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 10_000,
      });

      expect(txRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { name: 'ADMIN' } }),
      );

      const [[createArgs]] = txUser.create.mock.calls as [
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

      expect(txWarehouse.upsert).toHaveBeenCalledWith(
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

    // Regresión de la auditoría 2026-09-01 (ronda 2): dos POST /setup/admin
    // concurrentes (dos dispositivos de la misma LAN, o un doble clic) ya no
    // pueden crear dos administradores -- Postgres aborta uno de los dos con
    // P2034, y ese request debe ver el mismo 409 que el chequeo normal, sin
    // haber escrito nada ni disparado el audit log.
    it('converts a P2034 serialization conflict into the same 409 as an existing admin', async () => {
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2034',
          clientVersion: '6.19.3',
        }),
      );

      await expect(
        service.createAdmin({
          email: 'segundo@opera.local',
          name: 'Segundo',
          password: 'Password-123!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(audit.log).not.toHaveBeenCalled();
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('rethrows any other transaction error as-is', async () => {
      prisma.$transaction.mockRejectedValue(new Error('conexión perdida'));

      await expect(
        service.createAdmin({
          email: 'otro@opera.local',
          name: 'Otro',
          password: 'Password-123!',
        }),
      ).rejects.toThrow('conexión perdida');
    });
  });
});
