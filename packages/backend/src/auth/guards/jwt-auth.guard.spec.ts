import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: JwtAuthGuard;
  let superCanActivate: jest.SpyInstance;

  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new JwtAuthGuard(reflector as unknown as Reflector);
    // JwtAuthGuard extends AuthGuard('jwt') — interceptamos el
    // canActivate real de passport (que necesita una estrategia
    // registrada) para poder probar solo la rama de @Public() acá; el
    // camino autenticado ya está cubierto de punta a punta por los e2e.
    superCanActivate = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(true);
  });

  afterEach(() => {
    superCanActivate.mockRestore();
  });

  it('bypasses passport entirely when the route is @Public()', () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(superCanActivate).not.toHaveBeenCalled();
  });

  it('delegates to the passport strategy when the route is not @Public()', () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    guard.canActivate(context);

    expect(superCanActivate).toHaveBeenCalledWith(context);
  });

  it('delegates to the passport strategy when no @Public() metadata is set at all', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    guard.canActivate(context);

    expect(superCanActivate).toHaveBeenCalledWith(context);
  });
});
