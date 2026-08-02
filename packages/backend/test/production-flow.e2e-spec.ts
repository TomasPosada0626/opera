import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/test-app';
import {
  createUserAndLogin,
  createCatalogFixtures,
  deleteUsers,
} from './support/fixtures';

// Historia completa: materias primas con costo -> receta -> orden de
// producción -> completar (consume componentes, entra el terminado,
// costea todo) -> el terminado producido se vende como inventario normal
// (SALIDA) -> reaparece en las alertas de bajo stock. Cubre en un solo test
// la interacción real entre BOM (#29), ProductionOrder (#30/#32/#33),
// costeo por promedio ponderado (#34) y el resto de inventario (M2) —
// mismo espíritu que #27 (test de concurrencia): una propiedad de extremo a
// extremo, no fragmentos aislados por endpoint.
describe('Full production flow (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminUserId: string;
  let categoryId: string;
  let unitId: string;
  let warehouseId: string;
  let componentAId: string;
  let componentBId: string;
  let finishedGoodId: string;
  let bomId: string;
  let orderId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'production-flow-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;

    const unique = Date.now();
    const fixtures = await createCatalogFixtures(prisma, `flow-${unique}`);
    categoryId = fixtures.category.id;
    unitId = fixtures.unit.id;
    warehouseId = fixtures.warehouse.id;

    componentAId = await createProduct(
      `FLOW-A-${unique}`,
      'Materia A',
      'RAW_MATERIAL',
    );
    componentBId = await createProduct(
      `FLOW-B-${unique}`,
      'Materia B',
      'RAW_MATERIAL',
    );
    finishedGoodId = await createProduct(
      `FLOW-FG-${unique}`,
      'Producto terminado',
      'FINISHED_GOOD',
      5,
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
      where: {
        productId: { in: [componentAId, componentBId, finishedGoodId] },
      },
    });
    await prisma.product.deleteMany({
      where: { id: { in: [componentAId, componentBId, finishedGoodId] } },
    });
    await prisma.warehouse.delete({ where: { id: warehouseId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.unit.delete({ where: { id: unitId } });
    await deleteUsers(prisma, [adminUserId]);
    await app.close();
  });

  async function createProduct(
    sku: string,
    name: string,
    type: 'RAW_MATERIAL' | 'FINISHED_GOOD',
    minStock?: number,
  ) {
    const product = await prisma.product.create({
      data: { sku, name, type, categoryId, unitId, minStock },
    });
    return product.id;
  }

  async function entrada(
    productId: string,
    quantity: number,
    unitCost: number,
  ) {
    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity, unitCost })
      .expect(201);
  }

  it('walks the full story: recipe -> stocked materials -> production order -> completion -> sale -> low-stock alert', async () => {
    // Materia A entra en dos lotes a distinto costo: promedio = (20*3+20*5)/40 = 4.
    await entrada(componentAId, 20, 3);
    await entrada(componentAId, 20, 5);
    // Materia B entra en un solo lote a costo 2.
    await entrada(componentBId, 50, 2);

    // Receta: 1 unidad del terminado consume 3 de A y 2 de B.
    const bom = await prisma.billOfMaterials.create({
      data: {
        productId: finishedGoodId,
        items: {
          create: [
            { componentId: componentAId, quantity: 3 },
            { componentId: componentBId, quantity: 2 },
          ],
        },
      },
    });
    bomId = bom.id;

    // Orden por 10 unidades: requiere 30 de A (hay 40) y 20 de B (hay 50).
    const createResponse = await request(app.getHttpServer())
      .post('/production-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: finishedGoodId, warehouseId, quantity: 10 })
      .expect(201);
    orderId = (createResponse.body as { id: string }).id;

    const completeResponse = await request(app.getHttpServer())
      .post(`/production-orders/${orderId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const completed = completeResponse.body as {
      status: string;
      totalCost: string;
      unitCost: string;
    };
    // Costo: 30 de A a 4/u = 120; 20 de B a 2/u = 40. total=160. unitCost=16.
    expect(completed.status).toBe('COMPLETADA');
    expect(completed.totalCost).toBe('160');
    expect(completed.unitCost).toBe('16');

    const stockA = await request(app.getHttpServer())
      .get(`/inventory/${componentAId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((stockA.body as { stock: string }).stock).toBe('10'); // 40 - 30

    const stockB = await request(app.getHttpServer())
      .get(`/inventory/${componentBId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((stockB.body as { stock: string }).stock).toBe('30'); // 50 - 20

    const stockFG = await request(app.getHttpServer())
      .get(`/inventory/${finishedGoodId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((stockFG.body as { stock: string }).stock).toBe('10');

    // El producto recién fabricado ya es inventario normal: se puede vender
    // (SALIDA) como cualquier otro producto, sin tratamiento especial.
    await request(app.getHttpServer())
      .post('/inventory/salidas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: finishedGoodId, warehouseId, quantity: 8 })
      .expect(201);

    const stockFGAfterSale = await request(app.getHttpServer())
      .get(`/inventory/${finishedGoodId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((stockFGAfterSale.body as { stock: string }).stock).toBe('2');

    // Con minStock=5 y stock=2, el terminado ahora debe salir en alertas.
    const lowStock = await request(app.getHttpServer())
      .get('/inventory/alertas/bajo-stock')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const lowStockIds = (lowStock.body as { id: string }[]).map(
      (product) => product.id,
    );
    expect(lowStockIds).toContain(finishedGoodId);
  });
});
