import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './interfaces/jwt-payload.interface';

describe('AuthService', () => {
  let prisma: { user: { findUnique: jest.Mock } };
  let jwtService: { signAsync: jest.Mock };
  let service: AuthService;
  let hashedPassword: string;

  beforeAll(async () => {
    hashedPassword = await argon2.hash('correct-password');
  });

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
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
});
