import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  MAIN_WAREHOUSE_NAME,
  upsertAdminRole,
  upsertMainWarehouse,
} from '../src/setup/bootstrap-defaults';

const prisma = new PrismaClient();

async function main() {
  const adminRole = await upsertAdminRole(prisma);

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'ADMIN_EMAIL y ADMIN_PASSWORD deben estar definidos (ver .env.example)',
    );
  }

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password: await argon2.hash(password),
      name: 'Administrador',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  // Sin esto, una instalación nueva queda con cero bodegas — y como
  // warehouseId es obligatorio en movimientos de inventario, pedidos y
  // órdenes de producción, el Administrador no puede crear nada hasta
  // que entre a Bodegas a crear una primero, sin ninguna pista de que
  // ese es el problema (los selects de bodega no explican por qué están
  // vacíos). La mayoría de negocios que usan Opera operan desde un solo
  // lugar (ver PRODUCT.md) — dejar una bodega lista de una vez cubre ese
  // caso común sin renunciar a soportar varias bodegas más adelante.
  await upsertMainWarehouse(prisma);

  console.log(`Rol ADMIN y usuario administrador (${email}) listos.`);
  console.log(`${MAIN_WAREHOUSE_NAME} lista.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
