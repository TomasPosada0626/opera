// Fixtures del test Playwright de proveedores
// (packages/desktop/e2e/suppliers.spec.ts).
//
// A diferencia de production-to-inventory.ts, este fixture NO crea el
// Supplier — todo el punto del test es crear el proveedor, su precio de
// producto y su compra a través de la UI real. Este script solo deja
// preparado el usuario ADMIN y el producto que el proveedor va a vender.
import { PrismaClient, ProductType } from '@prisma/client';
import * as argon2 from 'argon2';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const STATE_FILE = path.join(__dirname, '.state-suppliers.json');

interface FixtureState {
  adminUserId: string;
  email: string;
  password: string;
  categoryId: string;
  unitId: string;
  warehouseId: string;
  productId: string;
  productSku: string;
  productName: string;
}

async function setup() {
  const unique = Date.now();
  const email = `e2e-playwright-suppliers-${unique}@opera.local`;
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
    data: { name: `PWSupCat-${unique}` },
  });
  const unit = await prisma.unit.create({
    data: {
      name: `PWSupUnit-${unique}`,
      abbreviation: `ps${unique}`.slice(0, 10),
    },
  });

  const product = await prisma.product.create({
    data: {
      sku: `PW-SUP-${unique}`,
      name: `Materia prima Playwright ${unique}`,
      type: ProductType.RAW_MATERIAL,
      categoryId: category.id,
      unitId: unit.id,
    },
  });

  // Registrar una compra en el test pasa por WarehouseSelect, que se
  // autoselecciona y oculta el campo solo con EXACTAMENTE una bodega activa
  // (ver components/form/WarehouseSelect.tsx) — sin esta bodega dedicada, el
  // conteo real depende de qué haya de sobra en la base compartida al
  // momento de correr, y el picker puede aparecer como un <select> real que
  // el test nunca completa.
  const warehouse = await prisma.warehouse.create({
    data: { name: `PWSupWarehouse-${unique}` },
  });

  const state: FixtureState = {
    adminUserId: user.id,
    email,
    password,
    categoryId: category.id,
    unitId: unit.id,
    warehouseId: warehouse.id,
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

  // El Supplier/SupplierProduct/SupplierPurchase los crea el propio test a
  // través de la UI, no este script — se identifican y se borran por
  // referenciar el productId de este fixture: solo el proveedor creado por
  // el test referencia ese producto específico. Orden FK-safe: compra ->
  // precio -> proveedor -> producto -> categoría/unidad -> auditLog -> user.
  const supplierPurchases = await prisma.supplierPurchase.findMany({
    where: { productId: state.productId },
    select: { supplierId: true },
  });
  const supplierProducts = await prisma.supplierProduct.findMany({
    where: { productId: state.productId },
    select: { supplierId: true },
  });
  const supplierIds = Array.from(
    new Set(
      [...supplierPurchases, ...supplierProducts].map((row) => row.supplierId),
    ),
  );

  await prisma.supplierPurchase.deleteMany({
    where: { productId: state.productId },
  });
  await prisma.supplierProduct.deleteMany({
    where: { productId: state.productId },
  });
  if (supplierIds.length > 0) {
    await prisma.supplier.deleteMany({ where: { id: { in: supplierIds } } });
  }
  await prisma.product.delete({ where: { id: state.productId } });
  await prisma.category.delete({ where: { id: state.categoryId } });
  await prisma.unit.delete({ where: { id: state.unitId } });
  await prisma.warehouse.delete({ where: { id: state.warehouseId } });
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
