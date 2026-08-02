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
});
