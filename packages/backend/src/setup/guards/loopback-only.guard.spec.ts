import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { LoopbackOnlyGuard } from './loopback-only.guard';

describe('LoopbackOnlyGuard', () => {
  const buildContext = (ip: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ ip }),
      }),
    }) as unknown as ExecutionContext;

  const guard = new LoopbackOnlyGuard();

  it('allows requests from 127.0.0.1', () => {
    expect(guard.canActivate(buildContext('127.0.0.1'))).toBe(true);
  });

  it('allows requests from the IPv6 loopback (::1)', () => {
    expect(guard.canActivate(buildContext('::1'))).toBe(true);
  });

  it('allows requests from the IPv4-mapped IPv6 loopback', () => {
    expect(guard.canActivate(buildContext('::ffff:127.0.0.1'))).toBe(true);
  });

  it('denies requests from any other address on the LAN', () => {
    expect(() => guard.canActivate(buildContext('192.168.1.50'))).toThrow(
      ForbiddenException,
    );
  });
});
