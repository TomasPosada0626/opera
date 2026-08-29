import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { AnyAuthenticated } from '../auth/decorators/any-authenticated.decorator';

@ApiTags('search')
@ApiBearerAuth()
// A propósito, no un @Roles olvidado: la búsqueda global es para cualquier
// usuario autenticado, sin distinción de rol.
@AnyAuthenticated()
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
