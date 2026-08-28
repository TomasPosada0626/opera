import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface LogParams {
  userId: string;
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}

// Los snapshots vienen de entidades de Prisma (con Date, etc.), no de JSON ya
// serializable — el round-trip por JSON produce el shape plano que Postgres
// puede guardar en una columna jsonb.
function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Se llama siempre DESPUÉS de que la mutación de negocio ya comitió (ver
  // los ~12 call sites) — nunca debe poder tumbar esa respuesta. Si la
  // escritura del AuditLog falla, el cliente ya recibió (o va a recibir) un
  // 2xx real por una operación que sí tuvo éxito; devolver un 500 acá sería
  // mentirle sobre el resultado. Se loguea como warning para que quede
  // rastro operacional del hueco de auditoría sin propagar la falla.
  async log(params: LogParams): Promise<void> {
    const { userId, entity, entityId, action, before, after } = params;
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          entity,
          entityId,
          action,
          before: toJsonValue(before),
          after: toJsonValue(after),
        },
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo escribir AuditLog para ${entity}:${entityId} (${action}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Consumido por el dashboard (#75) para la sección de "actividad
  // reciente" — sin before/after (el dashboard solo necesita el qué/quién/
  // cuándo, no los snapshots completos que sí importan al auditar un caso
  // puntual).
  getRecent(limit: number) {
    return this.prisma.auditLog.findMany({
      take: limit,
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        entity: true,
        entityId: true,
        action: true,
        timestamp: true,
        user: { select: { id: true, name: true } },
      },
    });
  }
}
