import { HealthController } from './health.controller';
import type {
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import type { PrismaService } from '../prisma/prisma.service';
import type { MailService } from '../mail/mail.service';

describe('HealthController', () => {
  let controller: HealthController;
  let health: { check: jest.Mock };
  let prismaHealth: { pingCheck: jest.Mock };
  let mail: { isConfigured: jest.Mock };
  const prisma = {} as PrismaService;

  beforeEach(() => {
    health = { check: jest.fn() };
    prismaHealth = { pingCheck: jest.fn() };
    mail = { isConfigured: jest.fn() };
    controller = new HealthController(
      health as unknown as HealthCheckService,
      prismaHealth as unknown as PrismaHealthIndicator,
      prisma,
      mail as unknown as MailService,
    );
  });

  it('runs a database ping check through HealthCheckService', () => {
    health.check.mockReturnValue({ status: 'ok' });

    const result = controller.check();

    expect(result).toEqual({ status: 'ok' });
    expect(health.check).toHaveBeenCalledWith([
      expect.any(Function),
      expect.any(Function),
    ]);

    // Ejecuta la función pasada a `check` para confirmar que de verdad
    // delega en `pingCheck('database', prisma)` — no solo que se llame a
    // `check()` con algo.
    const calls = health.check.mock.calls as [Array<() => unknown>][];
    const indicatorFn = calls[0][0][0];
    prismaHealth.pingCheck.mockReturnValue({ database: { status: 'up' } });
    indicatorFn();
    expect(prismaHealth.pingCheck).toHaveBeenCalledWith('database', prisma);
  });

  it('reports smtp as "up" and configured:true when MailService is configured', () => {
    health.check.mockReturnValue({ status: 'ok' });
    mail.isConfigured.mockReturnValue(true);

    controller.check();

    const calls = health.check.mock.calls as [Array<() => unknown>][];
    const smtpIndicatorFn = calls[0][0][1];
    expect(smtpIndicatorFn()).toEqual({
      smtp: { status: 'up', configured: true },
    });
  });

  it('reports smtp as "up" (never "down") and configured:false when SMTP is not set', () => {
    health.check.mockReturnValue({ status: 'ok' });
    mail.isConfigured.mockReturnValue(false);

    controller.check();

    const calls = health.check.mock.calls as [Array<() => unknown>][];
    const smtpIndicatorFn = calls[0][0][1];
    expect(smtpIndicatorFn()).toEqual({
      smtp: { status: 'up', configured: false },
    });
  });
});
