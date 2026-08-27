// Fixtures del test Playwright de pedidos -> remisión (packages/desktop/e2e/orders-remission.spec.ts).
//
// Igual que production-to-inventory.ts: crear un pedido con el estado
// EN_ALMACEN necesario para probar el flujo completo no tiene un camino
// simple por HTTP (habría que loguearse, crear cliente/producto/bodega,
// crear el pedido, marcarlo en producción y marcarlo en almacén, todo antes
// de que el test de Playwright pueda empezar) — así que el setup habla con
// Prisma directo, igual que los fixtures de los e2e de Jest del backend
// (test/support/fixtures.ts). El login real, la creación del pedido, las
// transiciones de estado y la remisión sí las hace Playwright a través de
// la UI real — este script solo deja la cuenta y el catálogo listos.
import { PrismaClient, ProductType } from '@prisma/client';
import * as argon2 from 'argon2';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const STATE_FILE = path.join(__dirname, '.state-orders.json');

interface FixtureState {
  adminUserId: string;
  email: string;
  password: string;
  categoryId: string;
  unitId: string;
  warehouseId: string;
  warehouseName: string;
  customerId: string;
  customerName: string;
  productId: string;
  productSku: string;
  productName: string;
}

async function setup() {
  const unique = Date.now();
  const email = `e2e-playwright-orders-${unique}@opera.local`;
  const password = 'Test-password-123!';

  const role = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN' },
  });
  const user = await prisma.user.create({
    data: {
      email,
      password: await argon2.hash(password),
      name: 'Playwright admin (pedidos)',
    },
  });
  await prisma.userRole.create({
    data: { userId: user.id, roleId: role.id },
  });

  const category = await prisma.category.create({
    data: { name: `PWOrdersCat-${unique}` },
  });
  const unit = await prisma.unit.create({
    data: {
      name: `PWOrdersUnit-${unique}`,
      abbreviation: `po${unique}`.slice(0, 10),
    },
  });
  const warehouse = await prisma.warehouse.create({
    data: { name: `PWOrdersWarehouse-${unique}` },
  });
  const customer = await prisma.customer.create({
    data: { name: `Cliente Playwright ${unique}` },
  });

  const product = await prisma.product.create({
    data: {
      sku: `PW-ORD-${unique}`,
      name: `Terminado Pedidos Playwright ${unique}`,
      type: ProductType.FINISHED_GOOD,
      categoryId: category.id,
      unitId: unit.id,
    },
  });

  // Stock inicial del terminado, previo a este pedido (p. ej. de otra
  // producción ya entregada a almacén) — 20 unidades. markWarehoused()
  // (OrdersService) escribe su propia ENTRADA por la cantidad exacta
  // pedida cuando el pedido pasa a EN_ALMACEN (ver comentario del método:
  // "El terminado entra al stock de verdad acá"), así que ese stock nuevo
  // se suma a este inicial — no hace falta "reservar" nada aquí, solo dejar
  // stock real ya existente para que el chequeo final de inventario
  // distinga stock previo de stock recién producido. ENTRADA directa vía
  // Prisma, no vía /inventory/entradas: no hay nada que el HTTP valide acá
  // que valga la pena ejercitar en un script de fixtures.
  await prisma.stockMovement.create({
    data: {
      productId: product.id,
      warehouseId: warehouse.id,
      type: 'ENTRADA',
      quantity: 20,
      unitCost: 50,
      userId: user.id,
    },
  });

  const state: FixtureState = {
    adminUserId: user.id,
    email,
    password,
    categoryId: category.id,
    unitId: unit.id,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    customerId: customer.id,
    customerName: customer.name,
    productId: product.id,
    productSku: product.sku,
    productName: product.name,
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log(JSON.stringify(state));
}

async function teardown() {
  if (!fs.existsSync(STATE_FILE)) {
    return;
  }
  const state = JSON.parse(
    fs.readFileSync(STATE_FILE, 'utf-8'),
  ) as FixtureState;

  const orders = await prisma.order.findMany({
    where: { customerId: state.customerId },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);

  const remissions = await prisma.remission.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true },
  });
  const remissionIds = remissions.map((remission) => remission.id);

  await prisma.remissionItem.deleteMany({
    where: { remissionId: { in: remissionIds } },
  });
  await prisma.remission.deleteMany({
    where: { id: { in: remissionIds } },
  });
  await prisma.orderItem.deleteMany({
    where: { orderId: { in: orderIds } },
  });
  await prisma.order.deleteMany({
    where: { id: { in: orderIds } },
  });
  await prisma.stockMovement.deleteMany({
    where: { productId: state.productId },
  });
  await prisma.product.delete({ where: { id: state.productId } });
  await prisma.customer.delete({ where: { id: state.customerId } });
  await prisma.warehouse.delete({ where: { id: state.warehouseId } });
  await prisma.category.delete({ where: { id: state.categoryId } });
  await prisma.unit.delete({ where: { id: state.unitId } });
  await prisma.auditLog.deleteMany({ where: { userId: state.adminUserId } });
  await prisma.user.delete({ where: { id: state.adminUserId } });
  fs.unlinkSync(STATE_FILE);
  console.log('teardown complete');
}

const mode = process.argv[2];
(mode === 'setup' ? setup() : teardown())
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
