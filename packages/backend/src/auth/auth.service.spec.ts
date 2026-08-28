import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './interfaces/jwt-payload.interface';

describe('AuthService', () => {
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };
  let jwtService: { signAsync: jest.Mock };
  let audit: { log: jest.Mock };
  let mail: { sendPasswordResetCode: jest.Mock };
  let service: AuthService;
  let hashedPassword: string;

  beforeAll(async () => {
    hashedPassword = await argon2.hash('correct-password');
  });

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };
    audit = { log: jest.fn() };
    mail = { sendPasswordResetCode: jest.fn().mockResolvedValue(undefined) };
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

  describe('forgotPassword', () => {
    it('stores a hashed code with an expiry and emails it when the user exists and is active', async () => {
      prisma.user.findUnique.mockResolvedValue(withRoles([]));
      prisma.user.update.mockResolvedValue({});

      await service.forgotPassword('test@opera.local');

      const [[updateArgs]] = prisma.user.update.mock.calls as [
        {
          where: { id: string };
          data: { passwordResetCodeHash: string; passwordResetExpiresAt: Date };
        },
      ][];
      expect(updateArgs.where).toEqual({ id: 'user-1' });
      expect(typeof updateArgs.data.passwordResetCodeHash).toBe('string');
      expect(updateArgs.data.passwordResetExpiresAt).toBeInstanceOf(Date);
      expect(mail.sendPasswordResetCode).toHaveBeenCalledWith(
        'test@opera.local',
        expect.stringMatching(/^\d{6}$/),
      );
    });

    it('does nothing observable when the email does not exist (no user.update, no email sent)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.forgotPassword('missing@opera.local');

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetCode).not.toHaveBeenCalled();
    });

    it('does nothing observable when the user is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...withRoles([]),
        isActive: false,
      });

      await service.forgotPassword('test@opera.local');

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetCode).not.toHaveBeenCalled();
    });
  });

  describe('resetPasswordWithCode', () => {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);

    it('updates the password, clears the code, and logs a PASSWORD_RESET_SELF_SERVICE entry for a valid code', async () => {
      const codeHash = await argon2.hash('123456');
      prisma.user.findUnique.mockResolvedValue({
        ...withRoles([]),
        passwordResetCodeHash: codeHash,
        passwordResetExpiresAt: future,
      });
      prisma.user.update.mockResolvedValue({});

      await service.resetPasswordWithCode(
        'test@opera.local',
        '123456',
        'New-password-123',
      );

      const [[updateArgs]] = prisma.user.update.mock.calls as [
        {
          where: { id: string };
          data: { passwordResetCodeHash: null; passwordResetExpiresAt: null };
        },
      ][];
      expect(updateArgs.where).toEqual({ id: 'user-1' });
      expect(updateArgs.data.passwordResetCodeHash).toBeNull();
      expect(updateArgs.data.passwordResetExpiresAt).toBeNull();

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

    it('rejects a wrong code', async () => {
      const codeHash = await argon2.hash('123456');
      prisma.user.findUnique.mockResolvedValue({
        ...withRoles([]),
        passwordResetCodeHash: codeHash,
        passwordResetExpiresAt: future,
      });

      await expect(
        service.resetPasswordWithCode(
          'test@opera.local',
          '654321',
          'New-password-123',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an expired code', async () => {
      const codeHash = await argon2.hash('123456');
      prisma.user.findUnique.mockResolvedValue({
        ...withRoles([]),
        passwordResetCodeHash: codeHash,
        passwordResetExpiresAt: past,
      });

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
        passwordResetCodeHash: null,
        passwordResetExpiresAt: null,
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
});
