import { Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const userInclude = { roles: { include: { role: true } } };

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
        password: await argon2.hash(dto.password),
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

  async deactivate(id: string, actingUserId: string) {
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
}
