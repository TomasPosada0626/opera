import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const userInclude = { roles: { include: { role: true } } };

// Explícitos, no los defaults implícitos de la librería — un futuro bump de
// `argon2` podría cambiar sus defaults en cualquier dirección sin que nadie
// lo note aquí. Valores iguales a los defaults actuales de argon2@0.45 (ver
// node_modules/argon2/argon2.cjs), así que fijarlos no cambia el hash de
// ningún usuario existente ni exige rehash.
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

function toResponse(user: User & { roles: unknown[] }) {
  const { id, email, name, isActive, createdAt, updatedAt, roles } = user;
  return { id, email, name, isActive, createdAt, updatedAt, roles };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, actingUserId: string) {
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: await argon2.hash(dto.password, HASH_OPTIONS),
        roles: dto.roleIds
          ? { create: dto.roleIds.map((roleId) => ({ roleId })) }
          : undefined,
      },
      include: userInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'User',
      entityId: user.id,
      action: 'CREATE',
      after: toResponse(user),
    });

    return toResponse(user);
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: userInclude,
      orderBy: { name: 'asc' },
    });

    return users.map(toResponse);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return toResponse(user);
  }

  async update(id: string, dto: UpdateUserDto, actingUserId: string) {
    const before = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });
    if (!before) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email,
        name: dto.name,
        roles: dto.roleIds
          ? {
              deleteMany: {},
              create: dto.roleIds.map((roleId) => ({ roleId })),
            }
          : undefined,
      },
      include: userInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'User',
      entityId: user.id,
      action: 'UPDATE',
      before: toResponse(before),
      after: toResponse(user),
    });

    return toResponse(user);
  }

  // ADMIN es el único rol que existe hoy (ver PRODUCT.md) — desactivar la
  // propia cuenta puede dejar la app sin nadie que pueda revertirlo desde
  // la UI (todo /users está detrás de @Roles('ADMIN')). Bloqueado acá, no
  // solo ocultado en el frontend, porque el frontend no es la autoridad de
  // seguridad real (mismo criterio que el resto del RBAC del proyecto).
  async deactivate(id: string, actingUserId: string) {
    if (id === actingUserId) {
      throw new BadRequestException('No puedes desactivar tu propia cuenta');
    }

    const before = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });
    if (!before) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      include: userInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'User',
      entityId: user.id,
      action: 'DEACTIVATE',
      before: toResponse(before),
      after: toResponse(user),
    });

    return toResponse(user);
  }

  async resetPassword(id: string, dto: ResetPasswordDto, actingUserId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { password: await argon2.hash(dto.newPassword, HASH_OPTIONS) },
      include: userInclude,
    });

    // No antes/después: la contraseña (ni siquiera el hash) no debe quedar en el
    // audit trail. Basta con dejar constancia de que el reseteo ocurrió.
    await this.audit.log({
      userId: actingUserId,
      entity: 'User',
      entityId: user.id,
      action: 'PASSWORD_RESET',
    });

    return toResponse(user);
  }
}
