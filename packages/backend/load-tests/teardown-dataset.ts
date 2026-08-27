// Borra todo lo que generate-dataset.ts creó, identificando cada entidad
// por su prefijo LOADTEST-/LT- en vez de por id (generar guarda decenas de
// miles de filas — llevar la cuenta de cada id en un archivo de estado
// sería más código que el propio borrado). Orden de borrado: hijos antes
// que padres, mismo criterio que e2e-fixtures/*.ts.
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const PREFIX = 'LOADTEST';
const OUTPUT_FILE = path.join(__dirname, '.dataset.json');

async function main() {
  const admin = await prisma.user.findUnique({
    where: { email: 'loadtest-admin@opera.local' },
  });

  const products = await prisma.product.findMany({
    where: { sku: { startsWith: 'LT-' } },
    select: { id: true },
  });
  const productIds = products.map((p) => p.id);

  const orders = await prisma.order.findMany({
    where: { warehouse: { name: { startsWith: `${PREFIX}-` } } },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);

  const remissions = await prisma.remission.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true },
  });
  const remissionIds = remissions.map((r) => r.id);

  console.log('Borrando remisiones...');
  await prisma.remissionItem.deleteMany({
    where: { remissionId: { in: remissionIds } },
  });
  await prisma.remission.deleteMany({ where: { id: { in: remissionIds } } });

  console.log('Borrando pedidos...');
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });

  console.log('Borrando compras a proveedor...');
  await prisma.supplierPurchase.deleteMany({
    where: { productId: { in: productIds } },
  });

  console.log('Borrando movimientos de stock...');
  await prisma.stockMovement.deleteMany({
    where: { productId: { in: productIds } },
  });

  console.log('Borrando catálogo...');
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.category.deleteMany({
    where: { name: { startsWith: `${PREFIX}-` } },
  });
  await prisma.unit.deleteMany({
    where: { name: { startsWith: `${PREFIX}-` } },
  });
  await prisma.warehouse.deleteMany({
    where: { name: { startsWith: `${PREFIX}-` } },
  });
  await prisma.customer.deleteMany({
    where: { name: { startsWith: `${PREFIX} ` } },
  });
  await prisma.supplier.deleteMany({
    where: { name: { startsWith: `${PREFIX} ` } },
  });

  if (admin) {
    console.log('Borrando usuario admin de carga...');
    await prisma.auditLog.deleteMany({ where: { userId: admin.id } });
    await prisma.userRole.deleteMany({ where: { userId: admin.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  }

  if (fs.existsSync(OUTPUT_FILE)) {
    fs.unlinkSync(OUTPUT_FILE);
  }
  console.log('Dataset de carga eliminado.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
