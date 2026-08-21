import { INestApplication } from '@nestjs/common';
import { ProductType } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { ProductionOrdersService } from '../src/production/production-orders.service';
import { createTestApp } from './support/test-app';
import {
  createUserAndLogin,
  createCatalogFixtures,
  deleteCatalogFixtures,
  deleteUsers,
} from './support/fixtures';

// Integración real contra Postgres (no mocks), mismo espíritu que #27
// (inventory-concurrency.e2e-spec.ts): ProductionOrdersService.complete()
// ya usa el mismo patrón $transaction Serializable + reintento en P2034
// que protege salidas/ajustes contra sobregiro, pero para completar dos
// veces la MISMA orden no había ningún test que lo demostrara (#91).
describe('Production order completion concurrency (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let inventoryService: InventoryService;
  let productionOrdersService: ProductionOrdersService;

  let adminUserId: string;
  let categoryId: string;
  let unitId: string;
  let warehouseId: string;
  let componentId: string;
  let finishedGoodId: string;
  let bomId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    inventoryService = app.get(InventoryService);
    productionOrdersService = app.get(ProductionOrdersService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'production-order-concurrency-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;

    const unique = Date.now();
    const fixtures = await createCatalogFixtures(prisma, `poc-${unique}`);
    categoryId = fixtures.category.id;
    unitId = fixtures.unit.id;
    warehouseId = fixtures.warehouse.id;

    const component = await prisma.product.create({
      data: {
        sku: `POC-COMP-${unique}`,
        name: 'Materia prima de prueba de concurrencia',
        type: ProductType.RAW_MATERIAL,
        categoryId,
        unitId,
      },
    });
    componentId = component.id;

    const finishedGood = await prisma.product.create({
      data: {
        sku: `POC-FG-${unique}`,
        name: 'Producto terminado de prueba de concurrencia',
        type: ProductType.FINISHED_GOOD,
        categoryId,
        unitId,
      },
    });
    finishedGoodId = finishedGood.id;

    const bom = await prisma.billOfMaterials.create({
      data: {
        productId: finishedGoodId,
        items: { create: [{ componentId, quantity: 1 }] },
      },
    });
    bomId = bom.id;

    // 1 unidad del terminado consume 1 de la materia prima; stock de sobra
    // para que la única transacción que gane no falle por escasez.
    await inventoryService.createEntry(
      { productId: componentId, warehouseId, quantity: 100, unitCost: 10 },
      adminUserId,
    );
  });

  afterAll(async () => {
    await prisma.billOfMaterialsItem.deleteMany({
      where: { billOfMaterialsId: bomId },
    });
    await prisma.billOfMaterials.delete({ where: { id: bomId } });
    await prisma.productionOrder.deleteMany({
      where: { productId: finishedGoodId },
    });
    await prisma.stockMovement.deleteMany({
      where: { productId: { in: [componentId, finishedGoodId] } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: [componentId, finishedGoodId] } },
    });
    await deleteCatalogFixtures(prisma, { categoryId, unitId, warehouseId });
    await deleteUsers(prisma, [adminUserId]);
    await app.close();
  });

  it('lets only one of several concurrent completions of the same order succeed', async () => {
    const order = await prisma.productionOrder.create({
      data: {
        productId: finishedGoodId,
        warehouseId,
        quantity: 5,
        userId: adminUserId,
      },
    });

    // 8 completados concurrentes de la MISMA orden — a lo mucho uno puede
    // ganar. Los demás deben fallar, ya sea por el chequeo de estado (si
    // llegan después de que el ganador ya comitió) o por el conflicto de
    // serialización de Postgres (P2034, si corrieron de verdad en paralelo).
    const attempts = Array.from({ length: 8 }, () =>
      productionOrdersService.complete(order.id, adminUserId),
    );
    const results = await Promise.allSettled(attempts);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(attempts.length - 1);
    for (const result of failed) {
      const reason = result.reason as { getStatus?: () => number };
      // Bajo contención fuerte, Prisma puede fallar con P2034
      // (conflicto de serialización al comitear) o P2028 (timeout
      // esperando el lock para ni siquiera empezar la transacción) —
      // el servicio traduce ambos al mismo 409, nunca un 500 sin
      // manejar (ver el fix en production-orders.service.ts).
      expect(reason.getStatus?.()).toBe(409);
    }

    const finalOrder = await prisma.productionOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(finalOrder.status).toBe('COMPLETADA');
    expect(finalOrder.completedAt).not.toBeNull();
    // Costo consistente con exactamente UN completado: 5 unidades consumen
    // 5 de la materia prima a costo 10/u = 50 total, 10/u el terminado.
    expect(finalOrder.totalCost?.toString()).toBe('50');
    expect(finalOrder.unitCost?.toString()).toBe('10');

    const componentStock = await inventoryService.getStock(
      componentId,
      warehouseId,
    );
    expect(componentStock.toString()).toBe('95'); // 100 - 5, no 100 - 5*N

    const finishedGoodStock = await inventoryService.getStock(
      finishedGoodId,
      warehouseId,
    );
    expect(finishedGoodStock.toString()).toBe('5'); // entrada una sola vez

    // El movimiento por lote fantasma sería la señal más directa de un
    // doble-completado: exactamente 1 SALIDA del componente + 1 ENTRADA
    // del terminado, nunca más, sin importar cuántos intentos concurrieron.
    const movementCount = await prisma.stockMovement.count({
      where: {
        productId: { in: [componentId, finishedGoodId] },
        reason: { contains: order.id },
      },
    });
    expect(movementCount).toBe(2);
  });
});
