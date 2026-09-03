import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
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
  private readonly logger = new Logger(SetupService.name);

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
  //
  // El backend escucha en 0.0.0.0 (LAN-first, ver ADR de TLS) y este
  // endpoint es @Public() -- sin transacción, dos requests concurrentes
  // (dos dispositivos de la misma red, o un doble clic) podían leer
  // user.count()===0 antes de que cualquiera escribiera, y ambos crear un
  // admin (auditoría 2026-09-01, ronda 2). $transaction Serializable hace
  // que Postgres aborte una de las dos en vez de dejar pasar la carrera --
  // mismo patrón que createMovementWithStockCheck en inventory.service.ts.
  async createAdmin(dto: CreateAdminDto) {
    // Hasheado ANTES de abrir la transacción, a propósito: argon2id es
    // CPU-bound y de duración real (cientos de ms), y hacerlo adentro
    // alargaba la ventana de contención justo cuando más importa que sea
    // corta (mismo principio que getAverageCostForProducts en
    // inventory.service.ts) -- con el hash adentro, dos POST /setup/admin
    // concurrentes bloqueaban tanto tiempo esperando el lock de `Role` que
    // Prisma abortaba con P2028 ("no se pudo iniciar la transacción a
    // tiempo") antes de llegar siquiera al conflicto de serialización real
    // que este fix busca (encontrado con el e2e de concurrencia real).
    const hashedPassword = await argon2.hash(dto.password, HASH_OPTIONS);

    let user;
    try {
      user = await this.prisma.$transaction(
        async (tx) => {
          const userCount = await tx.user.count();
          if (userCount > 0) {
            throw new ConflictException(
              'Ya existe un administrador configurado',
            );
          }

          const adminRole = await tx.role.upsert({
            where: { name: 'ADMIN' },
            update: {},
            create: { name: 'ADMIN' },
          });

          const createdUser = await tx.user.create({
            data: {
              email: dto.email,
              name: dto.name,
              password: hashedPassword,
              roles: { create: { roleId: adminRole.id } },
            },
            include: {
              roles: {
                include: {
                  role: {
                    include: {
                      permissions: { include: { permission: true } },
                    },
                  },
                },
              },
            },
          });

          // Sin esto, una instalación nueva queda con cero bodegas -- mismo
          // motivo que en prisma/seed.ts.
          await tx.warehouse.upsert({
            where: { name: MAIN_WAREHOUSE_NAME },
            update: {},
            create: { name: MAIN_WAREHOUSE_NAME },
          });

          return createdUser;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          // Defaults de Prisma (maxWait 2s / timeout 5s) están pensados
          // para transacciones de request normales -- acá, bajo carga
          // concurrente real, el INSERT en Role (name='ADMIN' única) puede
          // bloquear detrás de la otra transacción el tiempo suficiente
          // para superarlos y salir como P2028 en vez del P2034 esperado
          // (encontrado con el e2e de concurrencia real). No hay costo en
          // subirlos: este endpoint corre una sola vez por instalación,
          // nunca en un flujo con latencia crítica.
          maxWait: 10_000,
          timeout: 10_000,
        },
      );
    } catch (error) {
      // P2034: Postgres abortó la transacción por conflicto de
      // serialización (dos POST /setup/admin concurrentes). El que pierde
      // la carrera debe ver el mismo 409 que ya devuelve el chequeo normal,
      // no un error genérico.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        this.logger.warn(
          'Conflicto de serialización creando el administrador inicial — dos requests concurrentes a /setup/admin',
        );
        throw new ConflictException('Ya existe un administrador configurado');
      }
      throw error;
    }

    // actingUserId = el propio usuario recién creado: todavía no hay un
    // actor autenticado distinto que haya disparado esta acción. Después de
    // que la transacción ya comitió -- mismo criterio que el resto de los
    // ~12 call sites de AuditService.log(), nunca antes de que la mutación
    // de negocio sea definitiva.
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
