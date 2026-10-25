import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from './decorators/public.decorator';
import { AnyAuthenticated } from './decorators/any-authenticated.decorator';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordWithCodeDto } from './dto/reset-password-with-code.dto';
import { ResetPasswordWithRecoveryCodeDto } from './dto/reset-password-with-recovery-code.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

// Configurable por env, no un ConfigService inyectado -- @Throttle() es un
// decorador, se evalúa una sola vez al cargar el módulo, antes de que
// exista cualquier instancia de Nest. Default 5 (el valor de producción de
// siempre) sin tocar; AUTH_LOGIN_RATE_LIMIT solo existe para el runner de
// Playwright (e2e/*.spec.ts), donde varios specs independientes hacen
// login real de verdad contra el mismo backend en la misma corrida -- el
// total agregado de esos logins (no cualquiera de ellos solo) puede
// superar 5/min según cuántos specs corran, sin que ninguno abuse del
// endpoint (encontrado agregando auth.spec.ts, que sumó 3 logins reales
// más a los ~4 que ya hacían el resto de specs juntos). Mismo criterio que
// RATE_LIMIT_PER_MINUTE (ver app.module.ts), pero acá solo afecta esta
// ruta, no el límite global.
const LOGIN_RATE_LIMIT = Number(process.env.AUTH_LOGIN_RATE_LIMIT) || 5;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Más estricto que el límite global (ThrottlerModule.forRoot en AppModule):
  // login es la única puerta de entrada, así que necesita su propio techo
  // bajo para hacer fuerza bruta impráctica sin bloquear el uso normal.
  @Throttle({ default: { ttl: 60_000, limit: LOGIN_RATE_LIMIT } })
  @ApiOperation({
    summary: 'Login',
    description:
      'Limitado a 5 intentos/min por IP en producción (ver @Throttle).',
  })
  @ApiResponse({ status: 200, description: 'JWT emitido.' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas.' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  // Más estricto que login (5/min): cada llamada intenta mandar un correo
  // real, no solo verificar credenciales — el techo bajo también limita el
  // abuso de "bombardear" la bandeja de alguien con códigos.
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({
    summary: 'Solicitar un código de recuperación de contraseña por correo',
    description:
      'Respuesta idéntica exista o no ese email en el sistema — nunca revela si un correo está registrado.',
  })
  @ApiResponse({
    status: 200,
    description: 'Si el correo existe, se envió un código de verificación.',
  })
  @ApiResponse({ status: 429, description: 'Demasiados intentos.' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return {
      message: 'Si el correo existe, se envió un código de verificación.',
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary: 'Restablecer la contraseña con el código recibido por correo',
    description: 'El código vence a los 15 minutos y es de un solo uso.',
  })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada.' })
  @ApiResponse({ status: 400, description: 'Código inválido o expirado.' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos.' })
  async resetPassword(@Body() dto: ResetPasswordWithCodeDto) {
    await this.authService.resetPasswordWithCode(
      dto.email,
      dto.code,
      dto.newPassword,
    );
    return { message: 'Contraseña actualizada.' };
  }

  @Public()
  @Get('recovery-options')
  @ApiOperation({
    summary: 'Qué vías de recuperación de contraseña hay en esta instalación',
    description:
      'email=true solo si SMTP está configurado. El código de recuperación offline siempre está disponible.',
  })
  @ApiResponse({ status: 200, description: '{ email, recoveryCode }' })
  recoveryOptions() {
    return this.authService.recoveryOptions();
  }

  @Public()
  @Post('reset-password-with-recovery-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary: 'Restablecer la contraseña con el código de recuperación',
    description:
      'Para instalaciones sin correo. El código usado se consume y se devuelve uno nuevo, que hay que anotar.',
  })
  @ApiResponse({
    status: 200,
    description: '{ recoveryCode } — el nuevo código de recuperación.',
  })
  @ApiResponse({
    status: 400,
    description: 'El correo o el código no coinciden.',
  })
  @ApiResponse({ status: 429, description: 'Demasiados intentos.' })
  resetPasswordWithRecoveryCode(@Body() dto: ResetPasswordWithRecoveryCodeDto) {
    return this.authService.resetPasswordWithRecoveryCode(
      dto.email,
      dto.recoveryCode,
      dto.newPassword,
    );
  }

  @AnyAuthenticated()
  @ApiBearerAuth()
  @Get('recovery-code')
  @ApiOperation({
    summary: 'Si el usuario actual ya tiene código de recuperación',
  })
  @ApiResponse({ status: 200, description: '{ hasRecoveryCode, createdAt }' })
  recoveryCodeStatus(@Req() req: AuthenticatedRequest) {
    return this.authService.recoveryCodeStatus(req.user.sub);
  }

  @AnyAuthenticated()
  @ApiBearerAuth()
  @Post('recovery-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary: 'Generar un código de recuperación nuevo para el usuario actual',
    description:
      'Reemplaza al anterior. Se devuelve en claro esta única vez; después solo se guarda su hash.',
  })
  @ApiResponse({ status: 200, description: '{ recoveryCode }' })
  async issueRecoveryCode(@Req() req: AuthenticatedRequest) {
    return {
      recoveryCode: await this.authService.issueRecoveryCode(req.user.sub),
    };
  }
}
