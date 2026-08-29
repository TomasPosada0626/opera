import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { AnyAuthenticated } from '../auth/decorators/any-authenticated.decorator';

@ApiTags('dashboard')
@ApiBearerAuth()
// A propósito, no un @Roles olvidado: cualquier usuario autenticado ve el
// resumen del home screen, sin distinción de rol.
@AnyAuthenticated()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('resumen')
  @ApiOperation({
    summary:
      'Indicadores agregados de todos los módulos para la pantalla de inicio',
    description:
      'Inventario valorizado y productos críticos, producción y pedidos por estado, ' +
      'compras/ventas recientes y actividad reciente del AuditLog.',
  })
  getSummary() {
    return this.dashboardService.getSummary();
  }
}
