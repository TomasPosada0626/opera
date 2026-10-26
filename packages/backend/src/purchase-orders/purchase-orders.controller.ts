import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { CreatePaymentDto } from '../remissions/dto/create-payment.dto';
import { VoidPaymentDto } from '../remissions/dto/void-payment.dto';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ListPurchaseOrdersDto } from './dto/list-purchase-orders.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('purchase-orders')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Registrar una compra a un proveedor (ADMIN)',
    description:
      'Varias líneas (producto, cantidad, costo). No mueve stock hasta recibirla. Acepta un anticipo opcional.',
  })
  @ApiResponse({ status: 201, description: 'Compra registrada.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o inactivos.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.purchaseOrders.create(dto, req.user.sub);
  }

  @Get()
  @ApiOperation({
    summary:
      'Listar compras (paginado; por número, proveedor, estado o solo las pendientes de recibir)',
  })
  findAll(@Query() query: ListPurchaseOrdersDto) {
    return this.purchaseOrders.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de una compra: líneas, recepciones, pagos y saldo',
  })
  @ApiResponse({ status: 404, description: 'Compra no encontrada.' })
  findOne(@Param('id') id: string) {
    return this.purchaseOrders.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Actualizar fecha esperada, factura del proveedor o notas (ADMIN)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.purchaseOrders.update(id, dto, req.user.sub);
  }

  @Post(':id/receive')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Recibir mercancía, total o parcial (ADMIN)',
    description:
      'Cada línea recibida es una ENTRADA del Kardex con el costo de la compra, en la bodega de la compra.',
  })
  @ApiResponse({ status: 200, description: 'Mercancía recibida.' })
  @ApiResponse({
    status: 400,
    description: 'Más de lo pendiente, línea ajena o compra cerrada.',
  })
  @ApiResponse({ status: 409, description: 'Otra recepción simultánea.' })
  receive(
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.purchaseOrders.receive(id, dto, req.user.sub);
  }

  @Patch(':id/close')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Dar por terminada una compra que llegó a medias (ADMIN)',
    description: 'El total pasa a ser el valor de lo recibido.',
  })
  close(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.purchaseOrders.close(id, req.user.sub);
  }

  @Patch(':id/cancel')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Cancelar una compra sin nada recibido ni pagos vigentes (ADMIN)',
  })
  cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.purchaseOrders.cancel(id, req.user.sub);
  }

  @Post(':id/payments')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Registrar un pago al proveedor por esta compra (ADMIN)',
  })
  @ApiResponse({ status: 400, description: 'Supera el saldo de la compra.' })
  addPayment(
    @Param('id') id: string,
    @Body() dto: CreatePaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.purchaseOrders.addPayment(id, dto, req.user.sub);
  }

  @Patch(':id/payments/:paymentId/void')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Anular un pago con su motivo (ADMIN)' })
  voidPayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: VoidPaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.purchaseOrders.voidPayment(id, paymentId, dto, req.user.sub);
  }
}
