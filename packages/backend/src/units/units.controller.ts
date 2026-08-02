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
import { UnitsService } from './units.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('units')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateUnitDto, @Req() req: AuthenticatedRequest) {
    return this.unitsService.create(dto, req.user.sub);
  }

  @Get()
  findAll(@Query() query: ListQueryDto) {
    return this.unitsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.unitsService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUnitDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.unitsService.update(id, dto, req.user.sub);
  }

  @Patch(':id/deactivate')
  @Roles('ADMIN')
  deactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.unitsService.deactivate(id, req.user.sub);
  }
}
