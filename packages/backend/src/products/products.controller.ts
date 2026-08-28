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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Crear producto (ADMIN)' })
  @ApiResponse({ status: 201, description: 'Producto creado.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  create(@Body() dto: CreateProductDto, @Req() req: AuthenticatedRequest) {
    return this.productsService.create(dto, req.user.sub);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar productos (paginado, buscable por nombre o SKU)',
  })
  findAll(@Query() query: ListQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un producto' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado.' })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Editar producto (ADMIN)' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.productsService.update(id, dto, req.user.sub);
  }

  @Patch(':id/deactivate')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Desactivar producto (ADMIN)' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado.' })
  deactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.productsService.deactivate(id, req.user.sub);
  }
}
