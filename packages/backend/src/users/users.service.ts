import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { HASH_OPTIONS } from '../auth/argon2-options';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';

const userInclude = { roles: { include: { role: true } } };
const sortableFields = ['name', 'email', 'createdAt'] as const;

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

  // Pagina igual que el resto de los catálogos (#20, auditoría) — antes
  // traía todos los usuarios de una sola vez, la única lista sin paginar
  // fuera de Roles (que se mantiene sin paginar a propósito, ver
  // RolesService.findAll: alimenta un picker de checkboxes, no una tabla).
  async findAll(query: ListQueryDto) {
    const {
      page = 1,
      pageSize = 20,
      sortBy,
      sortOrder = 'asc',
      search,
    } = query;
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const orderBy = resolveOrderBy(sortBy, sortOrder, sortableFields, 'name');

    const result = await paginate(
      () => this.prisma.user.count({ where }),
      ({ skip, take }) =>
        this.prisma.user.findMany({
          where,
          include: userInclude,
          orderBy,
          skip,
          take,
        }),
      page,
      pageSize,
    );

    return { ...result, data: result.data.map(toResponse) };
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

  // Borrado de PII a pedido (#15, auditoría de datos/legal). Mismo criterio
  // que deactivate: bloqueado también del lado del servidor, no solo
  // ocultado en la UI. email es @unique y no nullable (a diferencia de
  // Customer/Supplier) -- un placeholder con el propio id garantiza que
  // anonimizar dos usuarios nunca choca entre sí.
  async anonymize(id: string, actingUserId: string) {
    if (id === actingUserId) {
      throw new BadRequestException('No puedes anonimizar tu propia cuenta');
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
      data: {
        name: 'Usuario eliminado',
        email: `usuario-eliminado-${randomUUID()}@opera.local`,
        isActive: false,
      },
      include: userInclude,
    });

    // Sin "before": guardarlo dejaría el email/nombre real que se acaba de
    // borrar viviendo para siempre en AuditLog (mismo criterio que
    // resetPassword, un poco más abajo).
    await this.audit.log({
      userId: actingUserId,
      entity: 'User',
      entityId: user.id,
      action: 'ANONYMIZE',
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
