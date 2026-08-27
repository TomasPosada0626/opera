// Genera un dataset sintético multi-año para medir el comportamiento real
// de los endpoints de Kardex/reportes/dashboard bajo volumen (item 7 de la
// lista de robustecimiento M6 — ver load-tests/README.md). No pasa por la
// lógica de negocio de Order/Remission (transiciones de estado, guards
// atómicos) porque eso ya está cubierto por los tests de concurrencia — acá
// solo importa el VOLUMEN de filas que StockMovement/Order/OrderItem tienen
// que sostener, no cómo llegaron ahí. Todo entra con createMany en lotes
// para que generar decenas de miles de filas tome segundos, no minutos.
//
// Todas las entidades de nivel superior llevan el prefijo LOADTEST- (o SKU
// LT-###) para que teardown-dataset.ts pueda encontrarlas y borrarlas sin
// necesidad de un archivo de estado con miles de ids.
import { PrismaClient, ProductType, OrderStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const PREFIX = 'LOADTEST';
const OUTPUT_FILE = path.join(__dirname, '.dataset.json');
const BATCH_SIZE = 2000;

const PRODUCT_COUNT = Number(process.env.LOADTEST_PRODUCTS ?? 120);
const MOVEMENTS_PER_PRODUCT = Number(process.env.LOADTEST_MOVEMENTS ?? 400);
const CUSTOMER_COUNT = Number(process.env.LOADTEST_CUSTOMERS ?? 250);
const SUPPLIER_COUNT = Number(process.env.LOADTEST_SUPPLIERS ?? 40);
const ORDER_COUNT = Number(process.env.LOADTEST_ORDERS ?? 3000);
const PURCHASE_COUNT = Number(process.env.LOADTEST_PURCHASES ?? 1500);
const YEARS_OF_HISTORY = 3;

const ADMIN_EMAIL = 'loadtest-admin@opera.local';
const ADMIN_PASSWORD = 'LoadTest-password-123!';

function randomDateWithinHistory(): Date {
  const now = Date.now();
  const spanMs = YEARS_OF_HISTORY * 365 * 24 * 60 * 60 * 1000;
  return new Date(now - Math.random() * spanMs);
}

function randomDecimal(min: number, max: number, decimals = 2): string {
  const value = min + Math.random() * (max - min);
  return value.toFixed(decimals);
}

async function insertInBatches<T>(
  label: string,
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await insert(batch);
    process.stdout.write(
      `\r${label}: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`,
    );
  }
  process.stdout.write('\n');
}

async function main() {
  console.log(
    `Generando dataset de carga: ${PRODUCT_COUNT} productos, ~${MOVEMENTS_PER_PRODUCT} movimientos c/u, ${ORDER_COUNT} pedidos, ${CUSTOMER_COUNT} clientes, ${SUPPLIER_COUNT} proveedores, ${PURCHASE_COUNT} compras.`,
  );

  const role = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN' },
  });

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      password: await argon2.hash(ADMIN_PASSWORD),
      name: `${PREFIX} admin`,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: role.id } },
    update: {},
    create: { userId: admin.id, roleId: role.id },
  });

  const warehouses = await Promise.all(
    [1, 2].map((n) =>
      prisma.warehouse.upsert({
        where: { name: `${PREFIX}-Bodega-${n}` },
        update: {},
        create: { name: `${PREFIX}-Bodega-${n}` },
      }),
    ),
  );

  const categories = await Promise.all(
    ['Madera', 'Herrajes', 'Pintura', 'Tornillería', 'Acabados', 'Empaque'].map(
      (name) =>
        prisma.category.upsert({
          where: { name: `${PREFIX}-${name}` },
          update: {},
          create: { name: `${PREFIX}-${name}` },
        }),
    ),
  );

  const units = await Promise.all(
    [
      { name: `${PREFIX}-Unidad`, abbreviation: 'lt-un' },
      { name: `${PREFIX}-Metro`, abbreviation: 'lt-m' },
      { name: `${PREFIX}-Kilogramo`, abbreviation: 'lt-kg' },
      { name: `${PREFIX}-Caja`, abbreviation: 'lt-cj' },
    ].map((unit) =>
      prisma.unit.upsert({
        where: { name: unit.name },
        update: {},
        create: unit,
      }),
    ),
  );

  console.log('Catálogo base (bodegas/categorías/unidades) listo.');

  const products = await Promise.all(
    Array.from({ length: PRODUCT_COUNT }, (_, i) => {
      const sku = `LT-${String(i + 1).padStart(4, '0')}`;
      const type =
        i % 3 === 0 ? ProductType.FINISHED_GOOD : ProductType.RAW_MATERIAL;
      return prisma.product.upsert({
        where: { sku },
        update: {},
        create: {
          sku,
          name: `${PREFIX} Producto ${i + 1}`,
          type,
          categoryId: categories[i % categories.length].id,
          unitId: units[i % units.length].id,
        },
      });
    }),
  );
  console.log(`${products.length} productos listos.`);

  // Historial de Kardex — la parte que de verdad importa para este load
  // test: InventoryService.getAverageCost() recorre TODO el historial de un
  // producto en cada llamada (ver comentario en inventory.service.ts), así
  // que el costo real de /reports/inventario y /dashboard escala con este
  // número, no con la cantidad de productos sola.
  type MovementRow = {
    productId: string;
    warehouseId: string;
    type: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
    quantity: string;
    unitCost: string | null;
    userId: string;
    createdAt: Date;
  };
  const movements: MovementRow[] = [];
  for (const product of products) {
    let stock = 0;
    for (let m = 0; m < MOVEMENTS_PER_PRODUCT; m++) {
      const isEntry = stock <= 0 || Math.random() < 0.55;
      const quantity = isEntry
        ? Number(randomDecimal(5, 100, 3))
        : -Math.min(stock, Number(randomDecimal(1, 40, 3)));
      stock += quantity;
      movements.push({
        productId: product.id,
        warehouseId: warehouses[m % warehouses.length].id,
        type: isEntry ? 'ENTRADA' : 'SALIDA',
        quantity: quantity.toFixed(3),
        unitCost: isEntry ? randomDecimal(1000, 50000, 4) : null,
        userId: admin.id,
        createdAt: randomDateWithinHistory(),
      });
    }
  }
  // createdAt debe quedar ascendente por producto para que el promedio
  // ponderado (que asume orden cronológico) tenga sentido — no es
  // obligatorio para el load test en sí (solo mide latencia), pero deja el
  // dataset internamente consistente si alguien lo inspecciona.
  movements.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  await insertInBatches('Movimientos de stock', movements, (batch) =>
    prisma.stockMovement.createMany({ data: batch }),
  );

  const customers = await prisma.customer.createManyAndReturn({
    data: Array.from({ length: CUSTOMER_COUNT }, (_, i) => ({
      name: `${PREFIX} Cliente ${i + 1}`,
    })),
    select: { id: true },
  });
  console.log(`${customers.length} clientes listos.`);

  const suppliers = await prisma.supplier.createManyAndReturn({
    data: Array.from({ length: SUPPLIER_COUNT }, (_, i) => ({
      name: `${PREFIX} Proveedor ${i + 1}`,
    })),
    select: { id: true },
  });
  console.log(`${suppliers.length} proveedores listos.`);

  const orderStatuses: OrderStatus[] = [
    'PENDIENTE',
    'EN_PRODUCCION',
    'EN_ALMACEN',
    'EN_ALMACEN',
    'CANCELADO',
  ];
  const orders = await prisma.order.createManyAndReturn({
    data: Array.from({ length: ORDER_COUNT }, (_, i) => ({
      customerId: customers[i % customers.length].id,
      warehouseId: warehouses[i % warehouses.length].id,
      userId: admin.id,
      status: orderStatuses[i % orderStatuses.length],
      createdAt: randomDateWithinHistory(),
    })),
    select: { id: true },
  });
  console.log(`${orders.length} pedidos listos.`);

  const finishedGoods = products.filter(
    (p) => p.type === ProductType.FINISHED_GOOD,
  );
  const orderItems = orders.flatMap((order) => {
    const lineCount = 1 + (Math.random() < 0.4 ? 1 : 0);
    return Array.from({ length: lineCount }, () => ({
      orderId: order.id,
      productId:
        finishedGoods[Math.floor(Math.random() * finishedGoods.length)].id,
      quantity: randomDecimal(1, 20, 3),
      unitPrice: randomDecimal(20000, 300000, 4),
    }));
  });
  await insertInBatches('Líneas de pedido', orderItems, (batch) =>
    prisma.orderItem.createMany({ data: batch }),
  );

  const purchases = Array.from({ length: PURCHASE_COUNT }, (_, i) => ({
    supplierId: suppliers[i % suppliers.length].id,
    productId: products[i % products.length].id,
    warehouseId: warehouses[i % warehouses.length].id,
    userId: admin.id,
    quantity: randomDecimal(10, 200, 3),
    unitCost: randomDecimal(500, 40000, 4),
    purchasedAt: randomDateWithinHistory(),
  }));
  await insertInBatches('Compras a proveedor', purchases, (batch) =>
    prisma.supplierPurchase.createMany({ data: batch }),
  );

  const sampleProductIds = products.slice(0, 20).map((p) => p.id);

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      {
        adminEmail: ADMIN_EMAIL,
        adminPassword: ADMIN_PASSWORD,
        sampleProductIds,
        generatedAt: new Date().toISOString(),
        counts: {
          products: products.length,
          movements: movements.length,
          customers: customers.length,
          suppliers: suppliers.length,
          orders: orders.length,
          orderItems: orderItems.length,
          purchases: purchases.length,
        },
      },
      null,
      2,
    ),
  );
  console.log(`Listo. Config para k6 escrita en ${OUTPUT_FILE}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
