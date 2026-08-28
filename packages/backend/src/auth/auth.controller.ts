import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordWithCodeDto } from './dto/reset-password-with-code.dto';

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
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary: 'Login',
    description: 'Limitado a 5 intentos/min por IP (ver @Throttle).',
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
}
