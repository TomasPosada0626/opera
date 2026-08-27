import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

// Sin @Roles/@UseGuards a propósito — un endpoint de salud lo consulta
// software de monitoreo, no un usuario logueado. No expone nada sensible:
// solo si el proceso responde y si Postgres es alcanzable.
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Estado del servicio',
    description:
      'A diferencia de GET / (que solo confirma que el proceso responde), ' +
      'este endpoint también verifica que Postgres esté realmente ' +
      'alcanzable — lo mínimo para monitoreo automatizado real.',
  })
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
    ]);
  }
}
