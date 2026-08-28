import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SupplierPurchasesService } from './supplier-purchases.service';
import { CreateSupplierPurchaseDto } from './dto/create-supplier-purchase.dto';
import { ListSupplierPurchasesDto } from './dto/list-supplier-purchases.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('supplier-purchases')
@ApiBearerAuth()
@Controller('supplier-purchases')
export class SupplierPurchasesController {
  constructor(
    private readonly supplierPurchasesService: SupplierPurchasesService,
  ) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Registrar una compra a un proveedor (ADMIN)',
    description:
      'Bitácora manual para seguimiento de gasto — no mueve stock, la entrada real al almacén sigue siendo un movimiento manual de Inventario aparte.',
  })
  @ApiResponse({ status: 201, description: 'Compra registrada.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({
    status: 404,
    description: 'Proveedor o producto no encontrado.',
  })
  create(
    @Body() dto: CreateSupplierPurchaseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.supplierPurchasesService.create(dto, req.user.sub);
  }

  @Get()
  @ApiOperation({
    summary:
      'Listar compras (paginado, filtrable por proveedor/producto/rango de fecha)',
  })
  findAll(@Query() query: ListSupplierPurchasesDto) {
    return this.supplierPurchasesService.findAll(query);
  }

  @Post(':id/receive')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Marcar una compra como recibida (ADMIN)',
    description:
      'Reconcilia la bitácora con el Kardex real: escribe una ENTRADA de stock por la cantidad completa registrada, en la bodega de la compra. No soporta recepción parcial.',
  })
  @ApiResponse({ status: 201, description: 'Compra recibida, stock movido.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({ status: 404, description: 'Compra no encontrada.' })
  @ApiResponse({
    status: 409,
    description: 'Ya estaba recibida, o no tiene bodega registrada.',
  })
  receive(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.supplierPurchasesService.receive(id, req.user.sub);
  }
}
