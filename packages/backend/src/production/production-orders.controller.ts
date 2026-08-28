import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { ListQueryDto } from '../common/dto/list-query.dto';
import { ProductionOrdersService } from './production-orders.service';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('production-orders')
@ApiBearerAuth()
@Controller('production-orders')
export class ProductionOrdersController {
  constructor(
    private readonly productionOrdersService: ProductionOrdersService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar órdenes de producción (paginado)' })
  findAll(@Query() query: ListQueryDto) {
    return this.productionOrdersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una orden de producción' })
  @ApiResponse({ status: 404, description: 'Orden no encontrada.' })
  findOne(@Param('id') id: string) {
    return this.productionOrdersService.findOne(id);
  }

  // ADMIN por ahora porque es el único rol que existe (mismo criterio que se
  // corrigió en inventario tras el /security-review de M2, ver README) — una
  // orden de producción compromete materiales reales, no es una lectura.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Crear orden de producción (ADMIN)' })
  @ApiResponse({ status: 201, description: 'Orden creada.' })
  @ApiResponse({
    status: 400,
    description:
      'Producto no es FINISHED_GOOD, sin receta activa, o sin stock suficiente de algún componente.',
  })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  create(
    @Body() dto: CreateProductionOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.productionOrdersService.create(dto, req.user.sub);
  }

  @Post(':id/complete')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Completar orden de producción (ADMIN)',
    description:
      'Consume la receta vigente, genera los StockMovement de componentes/terminado y calcula el costo — todo atómico bajo Serializable.',
  })
  @ApiResponse({ status: 400, description: 'Stock insuficiente al revalidar.' })
  @ApiResponse({ status: 404, description: 'Orden no encontrada.' })
  @ApiResponse({
    status: 409,
    description: 'Conflicto de concurrencia — otra request ganó la carrera.',
  })
  complete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.productionOrdersService.complete(id, req.user.sub);
  }

  @Patch(':id/cancel')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Cancelar orden de producción (ADMIN)',
    description:
      'No revierte stock — crear la orden nunca lo movió. Solo mientras siga PENDIENTE.',
  })
  @ApiResponse({ status: 400, description: 'La orden ya no está PENDIENTE.' })
  @ApiResponse({ status: 404, description: 'Orden no encontrada.' })
  @ApiResponse({
    status: 409,
    description: 'Conflicto de concurrencia — otra request ganó la carrera.',
  })
  cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.productionOrdersService.cancel(id, req.user.sub);
  }
}
