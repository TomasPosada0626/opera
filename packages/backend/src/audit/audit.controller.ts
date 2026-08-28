import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Consultar el registro de auditoría (ADMIN)',
    description:
      'Filtra por entidad, entityId, usuario y/o rango de fechas -- "¿quién cambió el pedido X y cuándo?", con before/after completos.',
  })
  @ApiResponse({ status: 200, description: 'Envoltorio paginado.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  query(@Query() query: AuditQueryDto) {
    return this.auditService.query(query);
  }
}
