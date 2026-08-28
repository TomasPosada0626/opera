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
import { UnitsService } from './units.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('units')
@ApiBearerAuth()
@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Crear unidad de medida (ADMIN)' })
  @ApiResponse({ status: 201, description: 'Unidad creada.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  create(@Body() dto: CreateUnitDto, @Req() req: AuthenticatedRequest) {
    return this.unitsService.create(dto, req.user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Listar unidades (paginado/buscable)' })
  findAll(@Query() query: ListQueryDto) {
    return this.unitsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una unidad' })
  @ApiResponse({ status: 404, description: 'Unidad no encontrada.' })
  findOne(@Param('id') id: string) {
    return this.unitsService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Editar unidad (ADMIN)' })
  @ApiResponse({ status: 404, description: 'Unidad no encontrada.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUnitDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.unitsService.update(id, dto, req.user.sub);
  }

  @Patch(':id/deactivate')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Desactivar unidad (ADMIN)' })
  @ApiResponse({ status: 404, description: 'Unidad no encontrada.' })
  deactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.unitsService.deactivate(id, req.user.sub);
  }
}
