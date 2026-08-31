import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, type Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Crear cliente (ADMIN)' })
  @ApiResponse({ status: 201, description: 'Cliente creado.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  create(@Body() dto: CreateCustomerDto, @Req() req: AuthenticatedRequest) {
    return this.customersService.create(dto, req.user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Listar clientes (paginado/buscable)' })
  findAll(@Query() query: ListQueryDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un cliente' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado.' })
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Get(':id/balance')
  @ApiOperation({
    summary: 'Saldo pendiente de un cliente',
    description:
      'Se deriva de lo remisionado (no de lo pedido) menos lo pagado por remisión — nunca un campo propio.',
  })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado.' })
  getBalance(@Param('id') id: string) {
    return this.customersService.getBalance(id);
  }

  // @Res() de Express directo, mismo patrón que ReportsController — el
  // .xlsx es contenido binario con sus propios headers.
  @Get(':id/export')
  @ApiOperation({
    summary: 'Exportar todos los datos del cliente, como .xlsx',
    description:
      'Portabilidad de datos a pedido del titular (#33, auditoría) — perfil completo + historial de pedidos.',
  })
  @ApiResponse({ status: 200, description: 'Archivo .xlsx.' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado.' })
  async exportExcel(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.customersService.exportExcel(id);
    res.set({
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="cliente-${id}.xlsx"`,
    });
    res.send(buffer);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Editar cliente (ADMIN)' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.customersService.update(id, dto, req.user.sub);
  }

  @Patch(':id/deactivate')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Desactivar cliente (ADMIN)' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado.' })
  deactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.customersService.deactivate(id, req.user.sub);
  }

  @Patch(':id/reactivate')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reactivar cliente (ADMIN)' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado.' })
  reactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.customersService.reactivate(id, req.user.sub);
  }

  @Patch(':id/anonymize')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Borrar los datos personales del cliente (ADMIN)',
    description:
      'Irreversible: sobreescribe nombre/email/teléfono/dirección y desactiva el registro. El pedido/historial de negocio no se borra.',
  })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado.' })
  anonymize(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.customersService.anonymize(id, req.user.sub);
  }
}
