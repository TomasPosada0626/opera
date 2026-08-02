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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateCategoryDto, @Req() req: AuthenticatedRequest) {
    return this.categoriesService.create(dto, req.user.sub);
  }

  @Get()
  findAll(@Query() query: ListQueryDto) {
    return this.categoriesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.categoriesService.update(id, dto, req.user.sub);
  }

  @Patch(':id/deactivate')
  @Roles('ADMIN')
  deactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.categoriesService.deactivate(id, req.user.sub);
  }
}
