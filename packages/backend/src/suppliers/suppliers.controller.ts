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
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateSupplierDto, @Req() req: AuthenticatedRequest) {
    return this.suppliersService.create(dto, req.user.sub);
  }

  @Get()
  findAll(@Query() query: ListQueryDto) {
    return this.suppliersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.suppliersService.update(id, dto, req.user.sub);
  }

  @Patch(':id/deactivate')
  @Roles('ADMIN')
  deactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.suppliersService.deactivate(id, req.user.sub);
  }
}
