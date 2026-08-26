import { Injectable } from '@nestjs/common';
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
  constructor(private readonly prisma: PrismaService) {}

  log({ userId, entity, entityId, action, before, after }: LogParams) {
    return this.prisma.auditLog.create({
      data: {
        userId,
        entity,
        entityId,
        action,
        before: toJsonValue(before),
        after: toJsonValue(after),
      },
    });
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
