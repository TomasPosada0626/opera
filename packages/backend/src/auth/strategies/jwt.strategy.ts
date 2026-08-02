import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { toRolesAndPermissions } from '../roles-permissions.util';

const userInclude = {
  roles: {
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  },
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: userInclude,
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sesión inválida');
    }

    // Desactivar, resetear contraseña o cambiar roles actualiza updatedAt.
    // Si eso pasó después de emitido el token, el token quedó obsoleto —
    // sin esto, un JWT ya emitido seguía siendo válido con permisos viejos
    // hasta su expiración natural, sin importar lo que el admin hiciera.
    // payload.iat tiene resolución de un segundo entero (NumericDate); hay
    // que redondear updatedAt igual antes de comparar — si no, un usuario
    // creado y logueado dentro del mismo segundo de reloj (updatedAt con
    // fracción de segundo mayor que iat truncado) queda marcado stale de
    // inmediato, aunque nada haya cambiado realmente después del login.
    const tokenIsStale =
      payload.iat !== undefined &&
      Math.floor(user.updatedAt.getTime() / 1000) > payload.iat;
    if (tokenIsStale) {
      throw new UnauthorizedException('Sesión inválida');
    }

    const { roles, permissions } = toRolesAndPermissions(user);
    return { sub: user.id, email: user.email, roles, permissions };
  }
}
