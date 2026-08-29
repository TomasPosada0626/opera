import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

// @Public() a propósito — un endpoint de salud lo consulta software de
// monitoreo, no un usuario logueado. No expone nada sensible: solo si el
// proceso responde y si Postgres es alcanzable.
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Estado del servicio',
    description:
      'A diferencia de GET / (que solo confirma que el proceso responde), ' +
      'este endpoint también verifica que Postgres esté realmente ' +
      'alcanzable, y expone si SMTP (recuperación de contraseña por ' +
      'correo) está configurado — lo mínimo para monitoreo automatizado ' +
      'real y para diagnosticar sin ir al log.',
  })
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      () => this.checkSmtp(),
    ]);
  }

  // Nunca 'down': MailService es best-effort a propósito (ver su propio
  // comentario) — que SMTP no esté configurado es un estado válido, no una
  // falla del servicio, así que no debe tumbar /health con un 503.
  // `configured` es la señal real para diagnosticar "por qué nadie recibe
  // el código de recuperación" sin ir al log (señalado en la auditoría
  // 2026-08-28).
  private checkSmtp(): HealthIndicatorResult {
    return { smtp: { status: 'up', configured: this.mail.isConfigured() } };
  }
}
