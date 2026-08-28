import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { toRolesAndPermissions } from './roles-permissions.util';
import { HASH_OPTIONS } from './argon2-options';

const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;

// crypto.randomInt (no Math.random) — un código de verificación es un
// secreto de corta vida, igual de sensible en espíritu a una contraseña:
// debe ser impredecible de verdad, no solo "parecer" aleatorio.
function generateResetCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// Hash señuelo, sin usuario real detrás — se computa una sola vez (argon2id
// es deliberadamente lento) y se cachea. Verificar contra esto cuando el
// email no existe hace que argon2.verify() corra con el mismo costo que un
// intento real, así el tiempo de respuesta no delata si un email está o no
// registrado (timing oracle real, señalado en la auditoría de seguridad:
// antes, `!user || ...` hacía short-circuit y nunca llamaba argon2.verify
// para un email inexistente, respondiendo notablemente más rápido).
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= argon2.hash('opera-timing-oracle-mitigation', HASH_OPTIONS);
  return dummyHash;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    const hashToCheck = user ? user.password : await getDummyHash();
    const passwordMatches = await argon2.verify(hashToCheck, password);

    if (!user || !user.isActive || !passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    const { roles, permissions } = toRolesAndPermissions(user);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles,
      permissions,
    };

    return { accessToken: await this.jwtService.signAsync(payload) };
  }

  // Respuesta siempre genérica al llamador, exista o no ese email — mismo
  // motivo que el timing oracle de arriba: nunca hay que revelar por HTTP
  // (ni por su tiempo de respuesta) si un correo está registrado. El
  // trabajo dominante (el hash argon2 del código) se paga siempre, exista o
  // no el usuario; el envío real de correo es fire-and-forget (no se
  // espera acá) para que la latencia de red del SMTP tampoco se filtre en
  // el tiempo de respuesta.
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const code = generateResetCode();
    const codeHash = await argon2.hash(code, HASH_OPTIONS);

    if (user && user.isActive) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetCodeHash: codeHash,
          passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });
      void this.mail.sendPasswordResetCode(user.email, code);
    }
  }

  async resetPasswordWithCode(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const hashToCheck = user?.passwordResetCodeHash ?? (await getDummyHash());
    const codeMatches = await argon2.verify(hashToCheck, code);
    const notExpired =
      !!user?.passwordResetExpiresAt &&
      user.passwordResetExpiresAt > new Date();

    if (
      !user ||
      !user.isActive ||
      !user.passwordResetCodeHash ||
      !codeMatches ||
      !notExpired
    ) {
      throw new BadRequestException('Código inválido o expirado');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: await argon2.hash(newPassword, HASH_OPTIONS),
        // Un solo uso: el código queda inválido apenas se consume, no solo
        // cuando expira solo.
        passwordResetCodeHash: null,
        passwordResetExpiresAt: null,
      },
    });

    // Sin before/after: la contraseña (ni su hash) no debe quedar en el
    // audit trail — mismo criterio que UsersService.resetPassword(). Acción
    // distinta (_SELF_SERVICE) para diferenciarlo en el audit log de un
    // reseteo hecho por un ADMIN sobre otra cuenta.
    await this.audit.log({
      userId: user.id,
      entity: 'User',
      entityId: user.id,
      action: 'PASSWORD_RESET_SELF_SERVICE',
    });
  }
}
