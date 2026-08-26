// Fixtures del test Playwright de #57 (packages/desktop/e2e/production-to-inventory.spec.ts).
//
// La creación de una receta (BillOfMaterials) no tiene endpoint HTTP — nunca
// lo tuvo, es un hueco real y conocido, no algo que este script deba resolver
// (ver src/production/production-orders.service.ts) — así que el setup habla
// con Prisma directo, igual que los fixtures de los specs e2e de Jest
// (test/support/fixtures.ts), no con la API. El login real sí lo hace
// Playwright a través de la UI — este script solo deja la cuenta creada.
import { PrismaClient, ProductType } from '@prisma/client';
import * as argon2 from 'argon2';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const STATE_FILE = path.join(__dirname, '.state.json');

interface FixtureState {
  adminUserId: string;
  email: string;
  password: string;
  categoryId: string;
  unitId: string;
  warehouseId: string;
  warehouseName: string;
  componentId: string;
  componentSku: string;
  finishedGoodId: string;
  finishedGoodSku: string;
  finishedGoodName: string;
  bomId: string;
}

async function setup() {
  const unique = Date.now();
  const email = `e2e-playwright-${unique}@opera.local`;
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
      name: 'Playwright admin',
    },
  });
  await prisma.userRole.create({
    data: { userId: user.id, roleId: role.id },
  });

  const category = await prisma.category.create({
    data: { name: `PWCat-${unique}` },
  });
  const unit = await prisma.unit.create({
    data: {
      name: `PWUnit-${unique}`,
      abbreviation: `pw${unique}`.slice(0, 10),
    },
  });
  const warehouse = await prisma.warehouse.create({
    data: { name: `PWWarehouse-${unique}` },
  });

  const component = await prisma.product.create({
    data: {
      sku: `PW-COMP-${unique}`,
      name: `Componente Playwright ${unique}`,
      type: ProductType.RAW_MATERIAL,
      categoryId: category.id,
      unitId: unit.id,
    },
  });
  const finishedGood = await prisma.product.create({
    data: {
      sku: `PW-FG-${unique}`,
      name: `Terminado Playwright ${unique}`,
      type: ProductType.FINISHED_GOOD,
      categoryId: category.id,
      unitId: unit.id,
    },
  });

  // 2 unidades de componente por cada terminado producido.
  const bom = await prisma.billOfMaterials.create({
    data: {
      productId: finishedGood.id,
      items: { create: [{ componentId: component.id, quantity: 2 }] },
    },
  });

  // Stock inicial del componente (10 — alcanza para producir hasta 5
  // terminados a 2 c/u). ENTRADA directa vía Prisma, no vía
  // /inventory/entradas: no hay nada que el HTTP valide aquí que valga la
  // pena ejercitar en un script de fixtures.
  await prisma.stockMovement.create({
    data: {
      productId: component.id,
      warehouseId: warehouse.id,
      type: 'ENTRADA',
      quantity: 10,
      unitCost: 5,
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
    componentId: component.id,
    componentSku: component.sku,
    finishedGoodId: finishedGood.id,
    finishedGoodSku: finishedGood.sku,
    finishedGoodName: finishedGood.name,
    bomId: bom.id,
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

  await prisma.stockMovement.deleteMany({
    where: { productId: { in: [state.componentId, state.finishedGoodId] } },
  });
  await prisma.productionOrder.deleteMany({
    where: { productId: state.finishedGoodId },
  });
  await prisma.billOfMaterialsItem.deleteMany({
    where: { billOfMaterialsId: state.bomId },
  });
  await prisma.billOfMaterials.delete({ where: { id: state.bomId } });
  await prisma.product.deleteMany({
    where: { id: { in: [state.componentId, state.finishedGoodId] } },
  });
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
