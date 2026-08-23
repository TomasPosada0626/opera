import {
  Body,
  Controller,
  Get,
  Param,
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
      'Registra un despacho parcial o total de un pedido. No genera StockMovement — el pedido ya descontó el inventario al crearse.',
  })
  @ApiResponse({ status: 201, description: 'Remisión creada.' })
  @ApiResponse({
    status: 400,
    description: 'Alguna línea excede lo pendiente por entregar del pedido.',
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
