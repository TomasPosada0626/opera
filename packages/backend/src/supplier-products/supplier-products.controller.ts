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
import { SupplierProductsService } from './supplier-products.service';
import { CreateSupplierProductDto } from './dto/create-supplier-product.dto';
import { ListSupplierProductsDto } from './dto/list-supplier-products.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('supplier-products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('supplier-products')
export class SupplierProductsController {
  constructor(
    private readonly supplierProductsService: SupplierProductsService,
  ) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Registrar o actualizar el precio de un producto para un proveedor (ADMIN)',
    description:
      'Lista de precios de referencia, no versionada — si el par proveedor/producto ya tiene precio, esta llamada lo sobreescribe.',
  })
  @ApiResponse({ status: 201, description: 'Precio registrado o actualizado.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({
    status: 404,
    description: 'Proveedor o producto no encontrado.',
  })
  create(
    @Body() dto: CreateSupplierProductDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.supplierProductsService.create(dto, req.user.sub);
  }

  @Get()
  @ApiOperation({
    summary:
      'Listar precios por proveedor (paginado, filtrable por proveedor/producto)',
  })
  findAll(@Query() query: ListSupplierProductsDto) {
    return this.supplierProductsService.findAll(query);
  }
}
