import { INestApplication } from '@nestjs/common';
import { ProductType } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { OrdersService } from '../src/orders/orders.service';
import { createTestApp } from './support/test-app';
import {
  createUserAndLogin,
  createCatalogFixtures,
  deleteCatalogFixtures,
  deleteUsers,
} from './support/fixtures';

// Integración real contra Postgres (no mocks), mismo espíritu que #27
// (inventory-concurrency.e2e-spec.ts) y #91 (production-order-concurrency):
// OrdersService.create() usa el mismo patrón $transaction Serializable +
// reintento en P2034/P2028 que protege salidas/ajustes contra sobregiro,
// pero nunca se probó contra Postgres real bajo pedidos concurrentes por el
// mismo producto — solo tenía cobertura con Prisma mockeado (encontrado en
// la auditoría de cobertura de pruebas, 2026-08-22).
describe('Order creation concurrency (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let inventoryService: InventoryService;
  let ordersService: OrdersService;

  let adminUserId: string;
  let categoryId: string;
  let unitId: string;
  let warehouseId: string;
  let productId: string;
  let customerId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    inventoryService = app.get(InventoryService);
    ordersService = app.get(OrdersService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'orders-concurrency-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;

    const unique = Date.now();
    const fixtures = await createCatalogFixtures(prisma, `oc-${unique}`);
    categoryId = fixtures.category.id;
    unitId = fixtures.unit.id;
    warehouseId = fixtures.warehouse.id;

    const product = await prisma.product.create({
      data: {
        sku: `OC-${unique}`,
        name: 'Producto de prueba de concurrencia de pedidos',
        type: ProductType.FINISHED_GOOD,
        categoryId,
        unitId,
      },
    });
    productId = product.id;

    const customer = await prisma.customer.create({
      data: { name: `Cliente de prueba de concurrencia ${unique}` },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { order: { customerId } } });
    await prisma.order.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
    await deleteCatalogFixtures(prisma, { categoryId, unitId, warehouseId });
    await deleteUsers(prisma, [adminUserId]);
    await app.close();
  });

  it('never lets concurrent orders for the same product oversell stock', async () => {
    await inventoryService.createEntry(
      { productId, warehouseId, quantity: 100, unitCost: 5 },
      adminUserId,
    );

    // 10 pedidos concurrentes de 20 unidades cada uno = 200 solicitadas
    // contra 100 disponibles. Como mucho 5 pueden ganar sin sobregirar.
    const attempts = Array.from({ length: 10 }, () =>
      ordersService.create(
        {
          customerId,
          warehouseId,
          items: [{ productId, quantity: 20, unitPrice: 10 }],
        },
        adminUserId,
      ),
    );
    const results = await Promise.allSettled(attempts);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(failed.length).toBeGreaterThan(0);
    expect(succeeded.length).toBeLessThanOrEqual(5);
    // Los perdedores fallan por 400 (stock insuficiente, si llegaron después
    // de que otros ya comitieron) o 409 (conflicto de serialización real) —
    // nunca un 500 sin manejar.
    for (const result of failed) {
      const reason = result.reason as { getStatus?: () => number };
      expect([400, 409]).toContain(reason.getStatus?.());
    }

    const finalStock = await inventoryService.getStock(productId, warehouseId);
    const expectedStock = 100 - succeeded.length * 20;
    expect(finalStock.toString()).toBe(expectedStock.toString());
    expect(finalStock.greaterThanOrEqualTo(0)).toBe(true);

    // Exactamente un pedido creado por cada intento ganador — nunca de más
    // (lo que delataría un doble-commit) ni de menos.
    const orderCount = await prisma.order.count({ where: { customerId } });
    expect(orderCount).toBe(succeeded.length);
  });
});
