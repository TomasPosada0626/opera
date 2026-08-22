import {
  Body,
  Controller,
  Get,
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
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateOrderDto, @Req() req: AuthenticatedRequest) {
    return this.ordersService.create(dto, req.user.sub);
  }

  @Get()
  findAll(@Query() query: ListQueryDto) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }
}
