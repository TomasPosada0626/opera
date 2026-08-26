import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { type Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ReportsService } from './reports.service';
import { DateRangeQueryDto } from '../common/dto/date-range-query.dto';
import { TopProductsQueryDto } from './dto/top-products-query.dto';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

  // @Res() de Express directo (no el flujo normal de retorno de Nest) — el
  // .xlsx es contenido binario con sus propios headers, mismo patrón que el
  // PDF de remisiones (RemissionsController.getPdf).
  @Get('inventario/excel')
  @ApiOperation({ summary: 'Inventario actual valorizado, como .xlsx' })
  @ApiResponse({ status: 200, description: 'Archivo .xlsx.' })
  async getInventoryExcel(@Res() res: Response) {
    const buffer = await this.reportsService.getInventoryExcel();
    res.set({
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': 'attachment; filename="inventario.xlsx"',
    });
    res.send(buffer);
  }

  @Get('ventas/excel')
  @ApiOperation({
    summary: 'Totales de ventas en un rango de fechas, como .xlsx',
  })
  @ApiResponse({ status: 200, description: 'Archivo .xlsx.' })
  async getSalesExcel(@Query() query: DateRangeQueryDto, @Res() res: Response) {
    const buffer = await this.reportsService.getSalesExcel(query);
    res.set({
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': 'attachment; filename="ventas.xlsx"',
    });
    res.send(buffer);
  }

  @Get('productos-mas-vendidos/excel')
  @ApiOperation({
    summary: 'Ranking de productos por cantidad vendida, como .xlsx',
  })
  @ApiResponse({ status: 200, description: 'Archivo .xlsx.' })
  async getTopProductsExcel(
    @Query() query: TopProductsQueryDto,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.getTopProductsExcel(query);
    res.set({
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition':
        'attachment; filename="productos-mas-vendidos.xlsx"',
    });
    res.send(buffer);
  }
}
