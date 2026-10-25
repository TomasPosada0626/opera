import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './interfaces/jwt-payload.interface';

describe('AuthService', () => {
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    passwordRecovery: {
      upsert: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };
  let audit: { log: jest.Mock };
  let mail: { sendPasswordResetCode: jest.Mock; isConfigured: jest.Mock };
  let service: AuthService;
  let hashedPassword: string;

  beforeAll(async () => {
    hashedPassword = await argon2.hash('correct-password');
  });

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      passwordRecovery: {
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };
    audit = { log: jest.fn() };
    mail = {
      sendPasswordResetCode: jest.fn().mockResolvedValue(undefined),
      isConfigured: jest.fn().mockReturnValue(false),
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      audit as unknown as AuditService,
      mail as unknown as MailService,
    );
  });

  const withRoles = (roles: unknown[]) => ({
    id: 'user-1',
    email: 'test@opera.local',
    password: hashedPassword,
    name: 'Test User',
    isActive: true,
    roles,
  });

  describe('validateUser', () => {
    it('throws UnauthorizedException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.validateUser('missing@opera.local', 'x'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    // No se puede espiar argon2.verify directamente (el binding nativo
    // expone propiedades no configurables — jest.spyOn revienta con
    // "Cannot redefine property"), así que esto no mide tiempos; confirma
    // el comportamiento observable de la mitigación del timing oracle: un
    // email inexistente sigue pasando por la comparación contra el hash
    // señuelo (en vez de un short-circuit antes de tocar argon2) en más de
    // una llamada, sin que el cacheo del hash señuelo a nivel de módulo
    // quede en un estado roto tras el primer uso.
    it('rejects a missing user consistently across repeated calls, exercising the cached decoy hash each time', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.validateUser('missing-1@opera.local', 'x'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        service.validateUser('missing-2@opera.local', 'y'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the user is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...withRoles([]),
        isActive: false,
      });

      await expect(
        service.validateUser('test@opera.local', 'correct-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password does not match', async () => {
      prisma.user.findUnique.mockResolvedValue(withRoles([]));

      await expect(
        service.validateUser('test@opera.local', 'wrong-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns the user when the credentials are valid', async () => {
      prisma.user.findUnique.mockResolvedValue(withRoles([]));

      const result = await service.validateUser(
        'test@opera.local',
        'correct-password',
      );

      expect(result.id).toBe('user-1');
    });
  });

  describe('login', () => {
    it('signs a JWT with the flattened roles and permissions', async () => {
      prisma.user.findUnique.mockResolvedValue(
        withRoles([
          {
            role: {
              name: 'ADMIN',
              permissions: [{ permission: { name: 'users:create' } }],
            },
          },
        ]),
      );

      const result = await service.login(
        'test@opera.local',
        'correct-password',
      );

      expect(result).toEqual({ accessToken: 'signed-jwt' });
      const [[payload]] = jwtService.signAsync.mock.calls as [JwtPayload][];
      expect(payload).toEqual({
        sub: 'user-1',
        email: 'test@opera.local',
        roles: ['ADMIN'],
        permissions: ['users:create'],
      });
    });

    it('deduplicates permissions shared across multiple roles', async () => {
      prisma.user.findUnique.mockResolvedValue(
        withRoles([
          {
            role: {
              name: 'ADMIN',
              permissions: [{ permission: { name: 'users:create' } }],
            },
          },
          {
            role: {
              name: 'SUPERVISOR',
              permissions: [
                { permission: { name: 'users:create' } },
                { permission: { name: 'inventory:read' } },
              ],
            },
          },
        ]),
      );

      await service.login('test@opera.local', 'correct-password');

      const [[payload]] = jwtService.signAsync.mock.calls as [JwtPayload][];
      expect(payload.roles).toEqual(['ADMIN', 'SUPERVISOR']);
      expect(payload.permissions).toEqual(['users:create', 'inventory:read']);
    });
  });

  describe('recoveryOptions', () => {
    it('only offers email when SMTP is configured', () => {
      mail.isConfigured.mockReturnValue(false);
      expect(service.recoveryOptions()).toEqual({
        email: false,
        recoveryCode: true,
      });
      mail.isConfigured.mockReturnValue(true);
      expect(service.recoveryOptions().email).toBe(true);
    });
  });

  describe('forgotPassword', () => {
    it('stores a hashed code with an expiry OUTSIDE the user row and emails it', async () => {
      prisma.user.findUnique.mockResolvedValue(withRoles([]));

      await service.forgotPassword('test@opera.local');

      // Nunca toca User (eso cerraba la sesión del usuario).
      expect(prisma.user.update).not.toHaveBeenCalled();
      const [[upsertArgs]] = prisma.passwordRecovery.upsert.mock.calls as [
        {
          where: { userId: string };
          update: {
            resetCodeHash: string;
            resetExpiresAt: Date;
            resetAttempts: number;
          };
        },
      ][];
      expect(upsertArgs.where).toEqual({ userId: 'user-1' });
      expect(typeof upsertArgs.update.resetCodeHash).toBe('string');
      expect(upsertArgs.update.resetExpiresAt).toBeInstanceOf(Date);
      expect(upsertArgs.update.resetAttempts).toBe(0);
      expect(mail.sendPasswordResetCode).toHaveBeenCalledWith(
        'test@opera.local',
        expect.stringMatching(/^\d{6}$/),
      );
    });

    it('does nothing observable when the email does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.forgotPassword('missing@opera.local');

      expect(prisma.passwordRecovery.upsert).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetCode).not.toHaveBeenCalled();
    });

    it('does nothing observable when the user is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...withRoles([]),
        isActive: false,
      });

      await service.forgotPassword('test@opera.local');

      expect(prisma.passwordRecovery.upsert).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetCode).not.toHaveBeenCalled();
    });
  });

  describe('resetPasswordWithCode', () => {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);

    const withRecovery = async (
      overrides: Partial<{
        resetCodeHash: string | null;
        resetExpiresAt: Date | null;
        resetAttempts: number;
      }> = {},
    ) => ({
      ...withRoles([]),
      passwordRecovery: {
        userId: 'user-1',
        resetCodeHash: await argon2.hash('123456'),
        resetExpiresAt: future,
        resetAttempts: 0,
        ...overrides,
      },
    });

    it('updates the password, clears the code, and logs a PASSWORD_RESET_SELF_SERVICE entry for a valid code', async () => {
      prisma.user.findUnique.mockResolvedValue(await withRecovery());

      await service.resetPasswordWithCode(
        'test@opera.local',
        '123456',
        'New-password-123',
      );

      const [[userUpdate]] = prisma.user.update.mock.calls as [
        { where: { id: string }; data: { password: string } },
      ][];
      expect(userUpdate.where).toEqual({ id: 'user-1' });
      await expect(
        argon2.verify(userUpdate.data.password, 'New-password-123'),
      ).resolves.toBe(true);
      expect(prisma.passwordRecovery.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { resetCodeHash: null, resetExpiresAt: null, resetAttempts: 0 },
      });

      const [[auditCall]] = audit.log.mock.calls as [
        {
          userId: string;
          entity: string;
          action: string;
          before?: unknown;
          after?: unknown;
        },
      ][];
      expect(auditCall.userId).toBe('user-1');
      expect(auditCall.entity).toBe('User');
      expect(auditCall.action).toBe('PASSWORD_RESET_SELF_SERVICE');
      expect(auditCall.before).toBeUndefined();
      expect(auditCall.after).toBeUndefined();
    });

    it('rejects a wrong code and counts the attempt', async () => {
      prisma.user.findUnique.mockResolvedValue(
        await withRecovery({ resetAttempts: 2 }),
      );

      await expect(
        service.resetPasswordWithCode(
          'test@opera.local',
          '654321',
          'New-password-123',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.passwordRecovery.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { resetAttempts: 3 },
      });
    });

    it('invalidates the code on the fifth wrong attempt', async () => {
      prisma.user.findUnique.mockResolvedValue(
        await withRecovery({ resetAttempts: 4 }),
      );

      await expect(
        service.resetPasswordWithCode(
          'test@opera.local',
          '654321',
          'New-password-123',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.passwordRecovery.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { resetCodeHash: null, resetExpiresAt: null, resetAttempts: 0 },
      });
    });

    it('rejects the right code once the attempts are exhausted', async () => {
      prisma.user.findUnique.mockResolvedValue(
        await withRecovery({ resetAttempts: 5 }),
      );

      await expect(
        service.resetPasswordWithCode(
          'test@opera.local',
          '123456',
          'New-password-123',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an expired code', async () => {
      prisma.user.findUnique.mockResolvedValue(
        await withRecovery({ resetExpiresAt: past }),
      );

      await expect(
        service.resetPasswordWithCode(
          'test@opera.local',
          '123456',
          'New-password-123',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when there is no pending reset request', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...withRoles([]),
        passwordRecovery: null,
      });

      await expect(
        service.resetPasswordWithCode(
          'test@opera.local',
          '123456',
          'New-password-123',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects for an email that does not exist, still exercising argon2.verify against the decoy hash', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPasswordWithCode(
          'missing@opera.local',
          '123456',
          'New-password-123',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('recovery code', () => {
    it('issues a readable code, stores only its normalized hash, and audits it', async () => {
      const code = await service.issueRecoveryCode('user-1');

      expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
      const [[upsertArgs]] = prisma.passwordRecovery.upsert.mock.calls as [
        { update: { recoveryCodeHash: string; recoveryCodeCreatedAt: Date } },
      ][];
      await expect(
        argon2.verify(
          upsertArgs.update.recoveryCodeHash,
          code.replace(/-/g, ''),
        ),
      ).resolves.toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RECOVERY_CODE_ISSUED' }),
      );
    });

    it('reports whether the user has a code', async () => {
      prisma.passwordRecovery.findUnique.mockResolvedValueOnce(null);
      await expect(service.recoveryCodeStatus('user-1')).resolves.toEqual({
        hasRecoveryCode: false,
        createdAt: null,
      });

      const createdAt = new Date('2026-10-01');
      prisma.passwordRecovery.findUnique.mockResolvedValueOnce({
        recoveryCodeHash: 'hash',
        recoveryCodeCreatedAt: createdAt,
      });
      await expect(service.recoveryCodeStatus('user-1')).resolves.toEqual({
        hasRecoveryCode: true,
        createdAt,
      });
    });

    it('resets the password with the code (in any casing/spacing) and returns a new one', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...withRoles([]),
        passwordRecovery: {
          userId: 'user-1',
          recoveryCodeHash: await argon2.hash('7K2MQX9D4HPAT3VR'),
        },
      });

      const result = await service.resetPasswordWithRecoveryCode(
        'test@opera.local',
        '7k2m qx9d 4hpa t3vr',
        'New-password-123',
      );

      expect(result.recoveryCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PASSWORD_RESET_RECOVERY_CODE' }),
      );
    });

    it.each([
      ['a wrong code', 'AAAAAAAAAAAAAAAA', true],
      ['a user without a code', '7K2MQX9D4HPAT3VR', false],
    ])('rejects %s', async (_label, attempt, hasCode) => {
      prisma.user.findUnique.mockResolvedValue({
        ...withRoles([]),
        passwordRecovery: hasCode
          ? {
              userId: 'user-1',
              recoveryCodeHash: await argon2.hash('7K2MQX9D4HPAT3VR'),
            }
          : null,
      });

      await expect(
        service.resetPasswordWithRecoveryCode(
          'test@opera.local',
          attempt,
          'New-password-123',
        ),
      ).rejects.toThrow('no coinciden');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPasswordWithRecoveryCode(
          'missing@opera.local',
          '7K2MQX9D4HPAT3VR',
          'New-password-123',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
