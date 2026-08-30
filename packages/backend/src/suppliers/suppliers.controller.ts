import {
  Body,
  Controller,
  Get,
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
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Crear proveedor (ADMIN)' })
  @ApiResponse({ status: 201, description: 'Proveedor creado.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  create(@Body() dto: CreateSupplierDto, @Req() req: AuthenticatedRequest) {
    return this.suppliersService.create(dto, req.user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Listar proveedores (paginado/buscable)' })
  findAll(@Query() query: ListQueryDto) {
    return this.suppliersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un proveedor' })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado.' })
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Editar proveedor (ADMIN)' })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.suppliersService.update(id, dto, req.user.sub);
  }

  @Patch(':id/deactivate')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Desactivar proveedor (ADMIN)' })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado.' })
  deactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.suppliersService.deactivate(id, req.user.sub);
  }

  @Patch(':id/reactivate')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reactivar proveedor (ADMIN)' })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado.' })
  reactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.suppliersService.reactivate(id, req.user.sub);
  }

  @Patch(':id/anonymize')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Borrar los datos personales del proveedor (ADMIN)',
    description:
      'Irreversible: sobreescribe nombre/email/teléfono/dirección y desactiva el registro. El historial de compras no se borra.',
  })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado.' })
  anonymize(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.suppliersService.anonymize(id, req.user.sub);
  }
}
