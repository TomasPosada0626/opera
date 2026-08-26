import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({
    summary: 'Búsqueda global rápida',
    description:
      'Salto directo a un registro por código/nombre/número — productos, clientes, ' +
      'proveedores, remisiones (número exacto) y órdenes de producción (por producto). ' +
      'No reemplaza los filtros propios de cada listado.',
  })
  search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }
}
