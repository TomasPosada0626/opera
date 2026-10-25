import { Body, Controller, Delete, Get, Param, Put, Req } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { BillOfMaterialsService } from './bill-of-materials.service';
import { UpsertBillOfMaterialsDto } from './dto/upsert-bill-of-materials.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

// Anidado bajo el producto porque cada producto terminado tiene a lo sumo
// una lista (BillOfMaterials.productId es @unique).
@ApiTags('bill-of-materials')
@ApiBearerAuth()
@Controller('products/:productId/bill-of-materials')
export class BillOfMaterialsController {
  constructor(private readonly billOfMaterials: BillOfMaterialsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista de materiales de un producto',
    description:
      'Qué materias primas e insumos lleva una unidad. items vacío si el producto todavía no tiene lista.',
  })
  @ApiResponse({ status: 404, description: 'Producto no encontrado.' })
  findOne(@Param('productId') productId: string) {
    return this.billOfMaterials.findByProduct(productId);
  }

  @Put()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Guardar la lista de materiales completa (ADMIN)',
    description:
      'Reemplaza todas las líneas. Al pasar un pedido a almacén o completar una orden de producción de este producto, se descuentan estos materiales del stock.',
  })
  @ApiResponse({ status: 200, description: 'Lista guardada.' })
  @ApiResponse({
    status: 400,
    description:
      'El producto no es terminado, un material está repetido, es un terminado o está desactivado.',
  })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({
    status: 404,
    description: 'Producto o material no encontrado.',
  })
  upsert(
    @Param('productId') productId: string,
    @Body() dto: UpsertBillOfMaterialsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.billOfMaterials.upsert(productId, dto, req.user.sub);
  }

  @Delete()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Quitar la lista de materiales (ADMIN)',
    description:
      'El producto vuelve a entrar al almacén sin descontar materiales.',
  })
  @ApiResponse({ status: 200, description: 'Lista eliminada.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({
    status: 404,
    description: 'El producto no tiene lista de materiales.',
  })
  remove(
    @Param('productId') productId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.billOfMaterials.remove(productId, req.user.sub);
  }
}
