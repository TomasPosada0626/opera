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
import {
  generateRecoveryCode,
  normalizeRecoveryCode,
} from './recovery-code.util';

const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
// Un código de 6 dígitos tiene 1.000.000 de combinaciones; con el rate
// limit por IP (5/min) solo, alguien con varias IPs en la LAN podía seguir
// probando durante los 15 minutos de vida del código. A los 5 fallos el
// código se invalida y hay que pedir uno nuevo (auditoría ronda 6).
const MAX_RESET_ATTEMPTS = 5;

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

  // Qué vías de recuperación existen en ESTA instalación — la pantalla de
  // "olvidé mi contraseña" solo ofrece el correo si SMTP está configurado
  // (en la app de escritorio no lo está), en vez de prometer un correo que
  // nunca va a llegar.
  recoveryOptions() {
    return { email: this.mail.isConfigured(), recoveryCode: true };
  }

  // Respuesta siempre genérica al llamador, exista o no ese email — mismo
  // motivo que el timing oracle de arriba: nunca hay que revelar por HTTP
  // (ni por su tiempo de respuesta) si un correo está registrado. El
  // trabajo dominante (el hash argon2 del código) se paga siempre, exista o
  // no el usuario; el envío real de correo es fire-and-forget (no se
  // espera acá) para que la latencia de red del SMTP tampoco se filtre en
  // el tiempo de respuesta. El código vive en PasswordRecovery, no en User:
  // tocar User aquí cerraba la sesión del usuario (ver schema.prisma).
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const code = generateResetCode();
    const codeHash = await argon2.hash(code, HASH_OPTIONS);

    if (user && user.isActive) {
      const reset = {
        resetCodeHash: codeHash,
        resetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        resetAttempts: 0,
      };
      await this.prisma.passwordRecovery.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...reset },
        update: reset,
      });
      void this.mail.sendPasswordResetCode(user.email, code);
    }
  }

  async resetPasswordWithCode(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { passwordRecovery: true },
    });
    const recovery = user?.passwordRecovery;
    const hashToCheck = recovery?.resetCodeHash ?? (await getDummyHash());
    const codeMatches = await argon2.verify(hashToCheck, code);
    const notExpired =
      !!recovery?.resetExpiresAt && recovery.resetExpiresAt > new Date();
    const attemptsLeft =
      !!recovery && recovery.resetAttempts < MAX_RESET_ATTEMPTS;

    if (
      !user ||
      !user.isActive ||
      !recovery?.resetCodeHash ||
      !codeMatches ||
      !notExpired ||
      !attemptsLeft
    ) {
      if (recovery?.resetCodeHash && !codeMatches) {
        // Cuenta el fallo; al quinto, el código deja de existir.
        const attempts = recovery.resetAttempts + 1;
        await this.prisma.passwordRecovery.update({
          where: { userId: recovery.userId },
          data:
            attempts >= MAX_RESET_ATTEMPTS
              ? { resetCodeHash: null, resetExpiresAt: null, resetAttempts: 0 }
              : { resetAttempts: attempts },
        });
      }
      throw new BadRequestException('Código inválido o expirado');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { password: await argon2.hash(newPassword, HASH_OPTIONS) },
      }),
      // Un solo uso: el código queda inválido apenas se consume, no solo
      // cuando expira solo.
      this.prisma.passwordRecovery.update({
        where: { userId: user.id },
        data: { resetCodeHash: null, resetExpiresAt: null, resetAttempts: 0 },
      }),
    ]);

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

  // Genera (o reemplaza) el código de recuperación offline del usuario y lo
  // devuelve en claro UNA sola vez — después solo queda su hash. Lo usan la
  // configuración inicial y "Código de recuperación" en el menú de usuario.
  async issueRecoveryCode(userId: string): Promise<string> {
    const code = generateRecoveryCode();
    const recoveryCodeHash = await argon2.hash(
      normalizeRecoveryCode(code),
      HASH_OPTIONS,
    );
    const data = { recoveryCodeHash, recoveryCodeCreatedAt: new Date() };
    await this.prisma.passwordRecovery.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    await this.audit.log({
      userId,
      entity: 'User',
      entityId: userId,
      action: 'RECOVERY_CODE_ISSUED',
    });
    return code;
  }

  async recoveryCodeStatus(userId: string) {
    const recovery = await this.prisma.passwordRecovery.findUnique({
      where: { userId },
    });
    return {
      hasRecoveryCode: !!recovery?.recoveryCodeHash,
      createdAt: recovery?.recoveryCodeCreatedAt ?? null,
    };
  }

  // Restablece la contraseña con el código de recuperación offline — la
  // salida cuando no hay correo (la app de escritorio) y nadie más puede
  // resetearla. Mismo cuidado con el timing que login/resetPasswordWithCode.
  // El código usado se consume: se emite uno nuevo y se devuelve, para que
  // quien lo usó lo anote antes de seguir.
  async resetPasswordWithRecoveryCode(
    email: string,
    recoveryCode: string,
    newPassword: string,
  ): Promise<{ recoveryCode: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { passwordRecovery: true },
    });
    const hashToCheck =
      user?.passwordRecovery?.recoveryCodeHash ?? (await getDummyHash());
    const matches = await argon2.verify(
      hashToCheck,
      normalizeRecoveryCode(recoveryCode),
    );

    if (
      !user ||
      !user.isActive ||
      !user.passwordRecovery?.recoveryCodeHash ||
      !matches
    ) {
      throw new BadRequestException(
        'El correo o el código de recuperación no coinciden',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: await argon2.hash(newPassword, HASH_OPTIONS) },
    });
    await this.audit.log({
      userId: user.id,
      entity: 'User',
      entityId: user.id,
      action: 'PASSWORD_RESET_RECOVERY_CODE',
    });

    return { recoveryCode: await this.issueRecoveryCode(user.id) };
  }
}
