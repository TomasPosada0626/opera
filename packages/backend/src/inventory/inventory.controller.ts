import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { InventoryService } from './inventory.service';
import { CreateEntryDto } from './dto/create-entry.dto';
import { CreateExitDto } from './dto/create-exit.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { KardexQueryDto } from './dto/kardex-query.dto';
import { StockSummaryQueryDto } from './dto/stock-summary-query.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('alertas/bajo-stock')
  @ApiOperation({
    summary: 'Productos activos por debajo de su minStock configurado',
  })
  getLowStockProducts() {
    return this.inventoryService.getLowStockProducts();
  }

  @Get('stock')
  @ApiOperation({
    summary: 'Stock de N productos en un solo groupBy (no N requests)',
  })
  getStockSummary(@Query() query: StockSummaryQueryDto) {
    return this.inventoryService.getStockForProducts(
      query.productIds,
      query.warehouseId,
    );
  }

  @Get(':productId/stock')
  @ApiOperation({
    summary: 'Stock actual de un producto (global y por bodega)',
  })
  @ApiResponse({ status: 404, description: 'Producto no encontrado.' })
  async getStock(@Param('productId') productId: string) {
    await this.inventoryService.assertProductExists(productId);

    const [stock, byWarehouse] = await Promise.all([
      this.inventoryService.getStock(productId),
      this.inventoryService.getStockByWarehouse(productId),
    ]);

    return { productId, stock, byWarehouse };
  }

  @Get(':productId/kardex')
  @ApiOperation({
    summary: 'Historial de movimientos de un producto (paginado)',
  })
  @ApiResponse({ status: 404, description: 'Producto no encontrado.' })
  async getKardex(
    @Param('productId') productId: string,
    @Query() query: KardexQueryDto,
  ) {
    await this.inventoryService.assertProductExists(productId);

    return this.inventoryService.getKardex(productId, query);
  }

  // ADMIN por ahora porque es el único rol que existe (ver /security-review de
  // M2): sin esto, cualquier JWT válido podía fabricar/drenar stock, lo que
  // falsifica el Kardex append-only que el resto del sistema trata como
  // autoritativo. Cuando exista un rol de operador de bodega, este decorador
  // debería apuntar a un permiso dedicado en vez de ADMIN.
  @Post('entradas')
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Registrar entrada de inventario (ADMIN)' })
  @ApiResponse({ status: 201, description: 'Movimiento registrado.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({ status: 404, description: 'Producto o bodega no encontrada.' })
  createEntry(@Body() dto: CreateEntryDto, @Req() req: AuthenticatedRequest) {
    return this.inventoryService.createEntry(dto, req.user.sub);
  }

  @Post('salidas')
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Registrar salida de inventario (ADMIN)' })
  @ApiResponse({ status: 201, description: 'Movimiento registrado.' })
  @ApiResponse({ status: 400, description: 'Stock insuficiente.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({ status: 404, description: 'Producto o bodega no encontrada.' })
  @ApiResponse({
    status: 409,
    description: 'Conflicto de concurrencia — otra request ganó la carrera.',
  })
  createExit(@Body() dto: CreateExitDto, @Req() req: AuthenticatedRequest) {
    return this.inventoryService.createExit(dto, req.user.sub);
  }

  @Post('ajustes')
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Registrar ajuste de inventario (ADMIN)' })
  @ApiResponse({ status: 201, description: 'Movimiento registrado.' })
  @ApiResponse({
    status: 400,
    description: 'Stock insuficiente, o el ajuste dejaría el stock igual (0).',
  })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({ status: 404, description: 'Producto o bodega no encontrada.' })
  @ApiResponse({
    status: 409,
    description: 'Conflicto de concurrencia — otra request ganó la carrera.',
  })
  createAdjustment(
    @Body() dto: CreateAdjustmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.createAdjustment(dto, req.user.sub);
  }
}
