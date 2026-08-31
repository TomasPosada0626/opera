import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, type Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('users')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Crear usuario (ADMIN)' })
  @ApiResponse({ status: 201, description: 'Usuario creado.' })
  @ApiResponse({ status: 403, description: 'No es ADMIN.' })
  create(@Body() dto: CreateUserDto, @Req() req: AuthenticatedRequest) {
    return this.usersService.create(dto, req.user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Listar usuarios (paginado/buscable, ADMIN)' })
  findAll(@Query() query: ListQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un usuario (ADMIN)' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  // @Res() de Express directo, mismo patrón que ReportsController — el
  // .xlsx es contenido binario con sus propios headers.
  @Get(':id/export')
  @ApiOperation({
    summary: 'Exportar todos los datos del usuario, como .xlsx (ADMIN)',
    description: 'Portabilidad de datos a pedido del titular (#33, auditoría).',
  })
  @ApiResponse({ status: 200, description: 'Archivo .xlsx.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  async exportExcel(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.usersService.exportExcel(id);
    res.set({
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="usuario-${id}.xlsx"`,
    });
    res.send(buffer);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar usuario (ADMIN)' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.update(id, dto, req.user.sub);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Desactivar usuario (ADMIN)' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  deactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.usersService.deactivate(id, req.user.sub);
  }

  @Patch(':id/anonymize')
  @ApiOperation({
    summary: 'Borrar los datos personales del usuario (ADMIN)',
    description:
      'Irreversible: sobreescribe nombre/email y desactiva la cuenta. No se puede anonimizar la propia cuenta.',
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  anonymize(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.usersService.anonymize(id, req.user.sub);
  }

  @Patch(':id/reset-password')
  @ApiOperation({ summary: 'Resetear contraseña de un usuario (ADMIN)' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.resetPassword(id, dto, req.user.sub);
  }
}
