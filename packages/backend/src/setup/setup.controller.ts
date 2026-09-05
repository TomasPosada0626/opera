import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { SetupService } from './setup.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { LoopbackOnlyGuard } from './guards/loopback-only.guard';

// Todo público a propósito: se consulta/usa antes de que exista ningún
// usuario con quien autenticar, en el primer arranque de una instalación
// nueva. createAdmin() en el service es la barrera real (se bloquea sola
// apenas exista un usuario) -- @Public() aquí no relaja esa protección.
@ApiTags('setup')
@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Public()
  @Get('status')
  @ApiOperation({
    summary:
      'Indica si esta instalación todavía necesita crear su primer administrador',
    description:
      'Consultado por el frontend antes de decidir entre mostrar el login o la pantalla de configuración inicial.',
  })
  @ApiResponse({ status: 200, description: '{ needsSetup: boolean }' })
  async status() {
    return { needsSetup: await this.setupService.needsSetup() };
  }

  @Public()
  @UseGuards(LoopbackOnlyGuard)
  @Post('admin')
  @HttpCode(HttpStatus.CREATED)
  // Bajo a propósito, igual que forgot-password: este endpoint solo debería
  // llamarse una vez por instalación real, así que un techo bajo alcanza
  // sin estorbar el uso normal. LoopbackOnlyGuard es la barrera principal
  // contra la carrera de la LAN (auditoría 2026-09-03); esto queda como
  // segunda capa.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary: 'Crea la primera cuenta de administrador de esta instalación',
    description:
      'Solo funciona si todavía no existe ningún usuario. Devuelve un JWT, igual que /auth/login.',
  })
  @ApiResponse({
    status: 201,
    description: 'JWT emitido para la cuenta recién creada.',
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un administrador configurado.',
  })
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.setupService.createAdmin(dto);
  }
}
