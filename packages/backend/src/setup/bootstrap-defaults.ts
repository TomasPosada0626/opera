import { Prisma, PrismaClient } from '@prisma/client';

export const ADMIN_ROLE_NAME = 'ADMIN';
export const MAIN_WAREHOUSE_NAME = 'Bodega principal';

// Los dos únicos upserts que `setup.service.ts` (bootstrap transaccional del
// primer admin, vía POST /setup/admin) y `prisma/seed.ts` (reseed idempotente
// de dev/CI) tenían duplicados byte a byte, con el mismo `where`/`create` --
// mantenerlos en dos archivos era lo que hacía real el riesgo de que un
// rename futuro (p. ej. "Bodega principal" -> otro nombre) quedara aplicado
// en uno y no en el otro (auditoría 2026-09-01, ronda 2, "aceptado pero
// mejorable"). El resto de cada flujo (transacción Serializable + JWT acá,
// upsert de User/UserRole con env vars allá) sigue distinto a propósito --
// son dos casos de uso genuinamente diferentes, no vale forzarlos a una sola
// función.
type BootstrapClient =
  Pick<PrismaClient, 'role' | 'warehouse'> | Prisma.TransactionClient;

export async function upsertAdminRole(client: BootstrapClient) {
  return client.role.upsert({
    where: { name: ADMIN_ROLE_NAME },
    update: {},
    create: { name: ADMIN_ROLE_NAME },
  });
}

export async function upsertMainWarehouse(client: BootstrapClient) {
  return client.warehouse.upsert({
    where: { name: MAIN_WAREHOUSE_NAME },
    update: {},
    create: { name: MAIN_WAREHOUSE_NAME },
  });
}
