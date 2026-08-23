import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ReportsService } from './reports.service';
import { DateRangeQueryDto } from './dto/date-range-query.dto';
import { TopProductsQueryDto } from './dto/top-products-query.dto';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('inventario')
  @ApiOperation({
    summary: 'Inventario actual valorizado',
    description:
      'Stock y costo promedio ponderado (ADR 0002) por producto activo.',
  })
  getInventoryReport() {
    return this.reportsService.getInventoryReport();
  }

  @Get('ventas')
  @ApiOperation({
    summary: 'Totales de ventas en un rango de fechas',
    description:
      'from/to opcionales, intervalo semiabierto [from, to). Excluye pedidos CANCELADO.',
  })
  getSalesReport(@Query() query: DateRangeQueryDto) {
    return this.reportsService.getSalesReport(query);
  }

  @Get('productos-mas-vendidos')
  @ApiOperation({
    summary: 'Ranking de productos por cantidad vendida',
    description:
      'sortOrder=desc (por defecto) para más vendidos, asc para menos vendidos.',
  })
  getTopProducts(@Query() query: TopProductsQueryDto) {
    return this.reportsService.getTopProducts(query);
  }
}
