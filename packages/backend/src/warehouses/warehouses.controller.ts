import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('warehouses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateWarehouseDto, @Req() req: AuthenticatedRequest) {
    return this.warehousesService.create(dto, req.user.sub);
  }

  @Get()
  findAll(@Query() query: ListQueryDto) {
    return this.warehousesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.warehousesService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.warehousesService.update(id, dto, req.user.sub);
  }

  @Patch(':id/deactivate')
  @Roles('ADMIN')
  deactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.warehousesService.deactivate(id, req.user.sub);
  }
}
