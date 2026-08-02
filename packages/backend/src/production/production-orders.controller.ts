import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { ProductionOrdersService } from './production-orders.service';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('production-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('production-orders')
export class ProductionOrdersController {
  constructor(
    private readonly productionOrdersService: ProductionOrdersService,
  ) {}

  @Get()
  findAll(@Query() query: ListQueryDto) {
    return this.productionOrdersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productionOrdersService.findOne(id);
  }

  // ADMIN por ahora porque es el único rol que existe (mismo criterio que se
  // corrigió en inventario tras el /security-review de M2, ver README) — una
  // orden de producción compromete materiales reales, no es una lectura.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN')
  create(
    @Body() dto: CreateProductionOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.productionOrdersService.create(dto, req.user.sub);
  }

  @Post(':id/complete')
  @Roles('ADMIN')
  complete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.productionOrdersService.complete(id, req.user.sub);
  }
}
