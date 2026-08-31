import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MailModule } from '../mail/mail.module';

const jwtModule = JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    secret: configService.getOrThrow<string>('JWT_SECRET'),
    signOptions: {
      // "1d", "12h", etc. — @nestjs/jwt tipa esto contra la unión estrecha
      // de jsonwebtoken en vez de string; el valor viene validado de .env.
      expiresIn: configService.getOrThrow<string>(
        'JWT_EXPIRES_IN',
      ) as JwtSignOptions['expiresIn'],
    },
  }),
});

@Module({
  imports: [PassportModule, MailModule, jwtModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // JwtModule también exportado (no solo AuthService): SetupModule lo
  // necesita para firmar el JWT de la primera cuenta de administrador con
  // el mismo secreto/expiración que /auth/login, sin duplicar la config.
  exports: [AuthService, jwtModule],
})
export class AuthModule {}
