import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles('ADMIN')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar roles disponibles (ADMIN)',
    description:
      'Solo lectura — usado por la pantalla de Usuarios para asignar roles.',
  })
  findAll() {
    return this.rolesService.findAll();
  }
}
