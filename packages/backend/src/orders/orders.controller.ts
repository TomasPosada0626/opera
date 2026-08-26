import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Crear pedido de venta (ADMIN)',
    description:
      'No mueve stock — este negocio fabrica sobre pedido, el terminado no existe todavía. El pedido nace PENDIENTE.',
  })
  @ApiResponse({ status: 201, description: 'Pedido creado.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({
    status: 404,
    description: 'Cliente, bodega o producto no encontrado.',
  })
  create(@Body() dto: CreateOrderDto, @Req() req: AuthenticatedRequest) {
    return this.ordersService.create(dto, req.user.sub);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar pedidos (paginado)',
    description:
      'Filtra por estado con ?status=PENDIENTE|EN_PRODUCCION|EN_ALMACEN|CANCELADO y/o por cliente con ?customerId=.',
  })
  findAll(@Query() query: ListOrdersDto) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un pedido con sus líneas y remisiones' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado.' })
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/mark-production')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Marcar pedido en producción (ADMIN)',
    description:
      'Bandera manual con timestamp para contar días — no consume materiales ni mueve stock.',
  })
  @ApiResponse({ status: 200, description: 'Pedido marcado en producción.' })
  @ApiResponse({
    status: 400,
    description: 'El pedido no está en estado PENDIENTE.',
  })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado.' })
  @ApiResponse({
    status: 409,
    description: 'Conflicto de concurrencia — otra request ganó la carrera.',
  })
  markProduction(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.ordersService.markProduction(id, req.user.sub);
  }

  @Post(':id/mark-warehoused')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Marcar pedido enviado a almacén (ADMIN)',
    description:
      'El terminado entra al stock de verdad acá — genera una ENTRADA por línea, cantidad completa pedida.',
  })
  @ApiResponse({ status: 200, description: 'Pedido marcado en almacén.' })
  @ApiResponse({
    status: 400,
    description: 'El pedido no está en estado EN_PRODUCCION.',
  })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado.' })
  @ApiResponse({
    status: 409,
    description: 'Conflicto de concurrencia — otra request ganó la carrera.',
  })
  markWarehoused(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.ordersService.markWarehoused(id, req.user.sub);
  }

  @Patch(':id/cancel')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Cancelar pedido (ADMIN)',
    description:
      'No revierte stock — este negocio no descuenta inventario al crear el pedido, ' +
      'y si ya está EN_ALMACEN ese terminado es un movimiento real del Kardex, no algo ' +
      'que deshacer. Rechaza si ya tiene remisiones (mercancía ya despachada).',
  })
  @ApiResponse({ status: 200, description: 'Pedido cancelado.' })
  @ApiResponse({
    status: 400,
    description: 'Ya está CANCELADO o ya tiene remisiones.',
  })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado.' })
  @ApiResponse({
    status: 409,
    description: 'Conflicto de concurrencia — otra request ganó la carrera.',
  })
  cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.ordersService.cancel(id, req.user.sub);
  }
}
