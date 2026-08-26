import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
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
