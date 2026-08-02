import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';

interface TestUser {
  id: string;
  email: string;
  token: string;
}

// roleName omitido = usuario autenticado sin ningún rol (para probar el
// camino de rechazo 403 del RbacGuard en rutas @Roles('ADMIN')).
export async function createUserAndLogin(
  app: INestApplication,
  prisma: PrismaService,
  opts: { emailPrefix: string; roleName?: string },
): Promise<TestUser> {
  const unique = `${opts.emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `${unique}@opera.local`;
  const password = 'Test-password-123!';

  const user = await prisma.user.create({
    data: {
      email,
      password: await argon2.hash(password),
      name: `E2E ${opts.emailPrefix}`,
    },
  });

  if (opts.roleName) {
    const role = await prisma.role.upsert({
      where: { name: opts.roleName },
      update: {},
      create: { name: opts.roleName },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
  }

  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);

  return {
    id: user.id,
    email,
    token: (response.body as { accessToken: string }).accessToken,
  };
}

export async function createCatalogFixtures(
  prisma: PrismaService,
  unique: string,
) {
  const category = await prisma.category.create({
    data: { name: `E2ECat-${unique}` },
  });
  const unit = await prisma.unit.create({
    data: { name: `E2EUnit-${unique}`, abbreviation: `u${unique}` },
  });
  const warehouse = await prisma.warehouse.create({
    data: { name: `E2EWarehouse-${unique}` },
  });

  return { category, unit, warehouse };
}

// AuditLog.userId no tiene onDelete: Cascade (a propósito — es un ledger de
// auditoría, no algo que deba desaparecer en silencio si se borra un
// usuario). Cualquier mutación hecha por un usuario de prueba deja filas ahí,
// así que el teardown debe borrarlas primero o el delete del usuario falla
// por violación de FK.
export async function deleteUsers(prisma: PrismaService, userIds: string[]) {
  await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

export async function deleteCatalogFixtures(
  prisma: PrismaService,
  ids: { categoryId: string; unitId: string; warehouseId: string },
) {
  await prisma.category.delete({ where: { id: ids.categoryId } });
  await prisma.unit.delete({ where: { id: ids.unitId } });
  await prisma.warehouse.delete({ where: { id: ids.warehouseId } });
}
