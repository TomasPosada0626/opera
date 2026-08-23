import {
  Body,
  Controller,
  Get,
  Param,
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
import { ListQueryDto } from '../common/dto/list-query.dto';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

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
      'Descuenta stock de inmediato (SALIDA por línea) dentro de la misma transacción Serializable que crea el pedido.',
  })
  @ApiResponse({ status: 201, description: 'Pedido creado.' })
  @ApiResponse({
    status: 400,
    description: 'Stock insuficiente en alguna línea (incluye el detalle).',
  })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({
    status: 404,
    description: 'Cliente, bodega o producto no encontrado.',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflicto de concurrencia — otra request ganó la carrera.',
  })
  create(@Body() dto: CreateOrderDto, @Req() req: AuthenticatedRequest) {
    return this.ordersService.create(dto, req.user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Listar pedidos (paginado)' })
  findAll(@Query() query: ListQueryDto) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un pedido con sus líneas y remisiones' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado.' })
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }
}
