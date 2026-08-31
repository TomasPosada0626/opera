import { ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HASH_OPTIONS } from '../auth/argon2-options';
import { toRolesAndPermissions } from '../auth/roles-permissions.util';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateAdminDto } from './dto/create-admin.dto';

const MAIN_WAREHOUSE_NAME = 'Bodega principal';

@Injectable()
export class SetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  async needsSetup(): Promise<boolean> {
    return (await this.prisma.user.count()) === 0;
  }

  // Reemplaza a prisma/seed.ts para el instalador empaquetado (ese script
  // sigue igual, sirve para dev/CI) -- misma secuencia (rol ADMIN, usuario,
  // UserRole, Bodega principal), pero cada instalación crea su propia
  // cuenta la primera vez que corre, en vez de repartir una credencial fija
  // por .env que sería idéntica en todas las instalaciones (auditoría
  // 2026-08-28, a partir del caso real de instalar Opera para un familiar).
  // Sin transacción para el chequeo+creación: esto solo se llama una vez,
  // en el primer arranque de una PC recién instalada -- no hay ningún
  // escenario real de dos llamadas concurrentes compitiendo por crear el
  // primer administrador.
  async createAdmin(dto: CreateAdminDto) {
    const userCount = await this.prisma.user.count();
    if (userCount > 0) {
      throw new ConflictException('Ya existe un administrador configurado');
    }

    const adminRole = await this.prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN' },
    });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: await argon2.hash(dto.password, HASH_OPTIONS),
        roles: { create: { roleId: adminRole.id } },
      },
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

    // Sin esto, una instalación nueva queda con cero bodegas -- mismo
    // motivo que en prisma/seed.ts.
    await this.prisma.warehouse.upsert({
      where: { name: MAIN_WAREHOUSE_NAME },
      update: {},
      create: { name: MAIN_WAREHOUSE_NAME },
    });

    // actingUserId = el propio usuario recién creado: todavía no hay un
    // actor autenticado distinto que haya disparado esta acción.
    await this.audit.log({
      userId: user.id,
      entity: 'User',
      entityId: user.id,
      action: 'BOOTSTRAP_ADMIN',
    });

    const { roles, permissions } = toRolesAndPermissions(user);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles,
      permissions,
    };

    return { accessToken: await this.jwtService.signAsync(payload) };
  }
}
