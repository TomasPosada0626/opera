import {
  Body,
  Controller,
  Get,
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
import { SupplierPurchasesService } from './supplier-purchases.service';
import { CreateSupplierPurchaseDto } from './dto/create-supplier-purchase.dto';
import { ListSupplierPurchasesDto } from './dto/list-supplier-purchases.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('supplier-purchases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
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
}
