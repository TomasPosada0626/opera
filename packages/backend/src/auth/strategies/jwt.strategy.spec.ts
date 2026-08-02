import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

describe('JwtStrategy', () => {
  let prisma: { user: { findUnique: jest.Mock } };
  let strategy: JwtStrategy;

  const configService = {
    getOrThrow: jest.fn().mockReturnValue('test-secret'),
  } as unknown as ConfigService;

  const basePayload: JwtPayload = {
    sub: 'user-1',
    email: 'test@opera.local',
    roles: ['ADMIN'],
    permissions: ['users:create'],
    iat: 1_700_000_000,
  };

  const userAt = (
    updatedAtSeconds: number,
    overrides: Partial<{ isActive: boolean }> = {},
  ) => ({
    id: 'user-1',
    email: 'test@opera.local',
    isActive: true,
    updatedAt: new Date(updatedAtSeconds * 1000),
    roles: [
      {
        role: {
          name: 'ADMIN',
          permissions: [{ permission: { name: 'users:create' } }],
        },
      },
    ],
    ...overrides,
  });

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    strategy = new JwtStrategy(
      configService,
      prisma as unknown as PrismaService,
    );
  });

  it('rejects when the user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(strategy.validate(basePayload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a deactivated user even with a still-valid, unexpired token', async () => {
    prisma.user.findUnique.mockResolvedValue(
      userAt(basePayload.iat! - 100, { isActive: false }),
    );

    await expect(strategy.validate(basePayload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token issued before the user was last updated (deactivate/reset/role change)', async () => {
    // El usuario se actualizó (updatedAt) DESPUÉS de emitido el token.
    prisma.user.findUnique.mockResolvedValue(userAt(basePayload.iat! + 100));

    await expect(strategy.validate(basePayload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a token issued after the last user update and returns fresh roles/permissions', async () => {
    prisma.user.findUnique.mockResolvedValue(userAt(basePayload.iat! - 100));

    const result = await strategy.validate(basePayload);

    expect(result).toEqual({
      sub: 'user-1',
      email: 'test@opera.local',
      roles: ['ADMIN'],
      permissions: ['users:create'],
    });
  });

  it('accepts a token when updatedAt falls in the same whole second as iat, even with a later millisecond offset', async () => {
    // payload.iat trunca a segundos enteros; updatedAt conserva milisegundos.
    // Un usuario creado y logueado en el mismo segundo de reloj puede tener
    // updatedAt.getTime()/1000 (con fracción) numéricamente mayor que iat
    // (sin fracción) aunque nada haya cambiado después del login — sin
    // Math.floor() en ambos lados, esto rechazaba el token de inmediato.
    const user = userAt(basePayload.iat!);
    user.updatedAt = new Date(basePayload.iat! * 1000 + 950);
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(strategy.validate(basePayload)).resolves.toEqual(
      expect.objectContaining({ sub: 'user-1' }),
    );
  });
});
