import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from './rbac.guard';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

describe('RbacGuard', () => {
  const buildContext = (user?: JwtPayload): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  const buildGuard = (metadata: {
    roles?: string[];
    permissions?: string[];
  }) => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === 'roles' ? metadata.roles : metadata.permissions,
      ),
    } as unknown as Reflector;

    return new RbacGuard(reflector);
  };

  const user: JwtPayload = {
    sub: 'user-1',
    email: 'admin@opera.local',
    roles: ['ADMIN'],
    permissions: ['users:create'],
  };

  it('allows the request when no roles or permissions are required', () => {
    const guard = buildGuard({});

    expect(guard.canActivate(buildContext(user))).toBe(true);
  });

  it('denies the request when no user is attached (unauthenticated)', () => {
    const guard = buildGuard({ roles: ['ADMIN'] });

    expect(guard.canActivate(buildContext(undefined))).toBe(false);
  });

  it('allows the request when the user has one of the required roles', () => {
    const guard = buildGuard({ roles: ['ADMIN', 'SUPERVISOR'] });

    expect(guard.canActivate(buildContext(user))).toBe(true);
  });

  it('denies the request when the user has none of the required roles', () => {
    const guard = buildGuard({ roles: ['SUPERVISOR'] });

    expect(guard.canActivate(buildContext(user))).toBe(false);
  });

  it('allows the request when the user has the required permission', () => {
    const guard = buildGuard({ permissions: ['users:create'] });

    expect(guard.canActivate(buildContext(user))).toBe(true);
  });

  it('denies the request when the user lacks the required permission', () => {
    const guard = buildGuard({ permissions: ['users:delete'] });

    expect(guard.canActivate(buildContext(user))).toBe(false);
  });

  it('requires both role and permission to match when both are declared', () => {
    const guard = buildGuard({
      roles: ['SUPERVISOR'],
      permissions: ['users:create'],
    });

    expect(guard.canActivate(buildContext(user))).toBe(false);
  });
});
