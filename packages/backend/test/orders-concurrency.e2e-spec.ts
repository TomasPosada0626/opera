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
// (inventory-concurrency.e2e-spec.ts) y #91 (production-order-concurrency).
//
// Con el rediseño del ciclo de vida (fabricación sobre pedido), crear un
// pedido ya no toca stock, así que ya no hay nada que sobregirar ahí. La
// condición de carrera real sobre stock ahora vive en markWarehoused(): a
// diferencia de markProduction() (que usa un `updateMany` con guard
// atómico), markWarehoused() lee el pedido fuera de la transacción y hace
// un `tx.order.update` incondicional dentro de ella, confiando en que
// Postgres bajo Serializable rechace la segunda escritura concurrente sobre
// la misma fila con un error de serialización — nunca se probó contra
// Postgres real que ese mecanismo de verdad evite escribir la ENTRADA dos
// veces bajo llamadas concurrentes genuinas, solo con Prisma mockeado.
describe('Order mark-warehoused concurrency (e2e)', () => {
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
  let orderId: string;

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

    const order = await ordersService.create(
      {
        customerId,
        warehouseId,
        items: [{ productId, quantity: 7, unitPrice: 10 }],
      },
      adminUserId,
    );
    orderId = order.id;
    await ordersService.markProduction(orderId, adminUserId);
  });

  afterAll(async () => {
    await prisma.remissionItem.deleteMany({
      where: { remission: { orderId } },
    });
    await prisma.remission.deleteMany({ where: { orderId } });
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
    await deleteCatalogFixtures(prisma, { categoryId, unitId, warehouseId });
    await deleteUsers(prisma, [adminUserId]);
    await app.close();
  });

  it('never double-credits stock when the same order is marked warehoused concurrently', async () => {
    // 8 llamadas concurrentes a marcar el MISMO pedido enviado a almacén —
    // solo una debe ganar; el resto debe rechazarse (400 si ya lo vieron
    // EN_ALMACEN tras perder la carrera de escritura, o 409 por conflicto
    // de serialización real de Postgres), nunca un 500 sin manejar.
    const attempts = Array.from({ length: 8 }, () =>
      ordersService.markWarehoused(orderId, adminUserId),
    );
    const results = await Promise.allSettled(attempts);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(7);
    for (const result of failed) {
      const reason = result.reason as { getStatus?: () => number };
      expect([400, 409]).toContain(reason.getStatus?.());
    }

    // Una sola ENTRADA por línea, nunca 8 — el stock final debe ser
    // exactamente la cantidad pedida, no un múltiplo de ella.
    const finalStock = await inventoryService.getStock(productId, warehouseId);
    expect(finalStock.toString()).toBe('7');

    const movementCount = await prisma.stockMovement.count({
      where: { productId, type: 'ENTRADA' },
    });
    expect(movementCount).toBe(1);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe('EN_ALMACEN');
  });
});
