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
  UseGuards,
} from '@nestjs/common';
import { Request, type Response } from 'express';
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
import { RemissionsService } from './remissions.service';
import { CreateRemissionDto } from './dto/create-remission.dto';
import { UpdateRemissionPaymentDto } from './dto/update-remission-payment.dto';
import { VoidRemissionDto } from './dto/void-remission.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('remissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('remissions')
export class RemissionsController {
  constructor(private readonly remissionsService: RemissionsService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Crear remisión (ADMIN)',
    description:
      'Registra un despacho parcial o total de un pedido. Descuenta stock de verdad (SALIDA por producto) — el pedido ya no lo hace al crearse.',
  })
  @ApiResponse({ status: 201, description: 'Remisión creada.' })
  @ApiResponse({
    status: 400,
    description:
      'Alguna línea excede lo pendiente por entregar, o el stock del producto es insuficiente para despachar.',
  })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({
    status: 404,
    description: 'Pedido o línea de pedido no encontrada.',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflicto de concurrencia — otra remisión ganó la carrera.',
  })
  create(@Body() dto: CreateRemissionDto, @Req() req: AuthenticatedRequest) {
    return this.remissionsService.create(dto, req.user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Listar remisiones (paginado)' })
  findAll(@Query() query: ListQueryDto) {
    return this.remissionsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una remisión' })
  @ApiResponse({ status: 404, description: 'Remisión no encontrada.' })
  findOne(@Param('id') id: string) {
    return this.remissionsService.findOne(id);
  }

  @Patch(':id/payment')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Actualizar estado de pago de una remisión (ADMIN)',
    description:
      'El pago normalmente se confirma después del despacho, no al crear la remisión.',
  })
  @ApiResponse({ status: 200, description: 'Estado de pago actualizado.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({ status: 404, description: 'Remisión no encontrada.' })
  updatePayment(
    @Param('id') id: string,
    @Body() dto: UpdateRemissionPaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.remissionsService.updatePayment(id, dto, req.user.sub);
  }

  @Patch(':id/void')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Anular remisión (ADMIN)',
    description:
      'No borra ni edita la fila (append-only) — la marca anulada con el motivo y ' +
      'escribe una ENTRADA de reverso por producto para corregir el stock.',
  })
  @ApiResponse({ status: 200, description: 'Remisión anulada.' })
  @ApiResponse({ status: 400, description: 'La remisión ya está anulada.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  @ApiResponse({ status: 404, description: 'Remisión no encontrada.' })
  @ApiResponse({
    status: 409,
    description: 'Conflicto de concurrencia — otra request ganó la carrera.',
  })
  voidRemission(
    @Param('id') id: string,
    @Body() dto: VoidRemissionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.remissionsService.voidRemission(id, dto, req.user.sub);
  }

  // @Res() de Express directo (no el flujo normal de retorno de Nest) — el
  // PDF es contenido binario con sus propios headers, no un JSON que el
  // interceptor de serialización de Nest deba tocar.
  @Get(':id/pdf')
  @ApiOperation({ summary: 'Descargar la nota de remisión en PDF' })
  @ApiResponse({ status: 200, description: 'PDF (application/pdf).' })
  @ApiResponse({ status: 404, description: 'Remisión no encontrada.' })
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, number } = await this.remissionsService.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="remision-${number}.pdf"`,
    });
    res.send(buffer);
  }
}
