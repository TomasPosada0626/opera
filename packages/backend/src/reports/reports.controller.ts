import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  getInventoryReport() {
    return this.reportsService.getInventoryReport();
  }

  @Get('ventas')
  getSalesReport(@Query() query: DateRangeQueryDto) {
    return this.reportsService.getSalesReport(query);
  }

  @Get('productos-mas-vendidos')
  getTopProducts(@Query() query: TopProductsQueryDto) {
    return this.reportsService.getTopProducts(query);
  }
}
