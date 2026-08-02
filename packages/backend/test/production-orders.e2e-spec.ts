import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ProductType } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/test-app';
import {
  createUserAndLogin,
  createCatalogFixtures,
  deleteUsers,
} from './support/fixtures';

describe('Production orders (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminUserId: string;
  let staffToken: string;
  let staffUserId: string;
  let categoryId: string;
  let unitId: string;
  let warehouseId: string;
  const productIds: string[] = [];
  const bomIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'production-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;

    const staff = await createUserAndLogin(app, prisma, {
      emailPrefix: 'production-staff',
    });
    staffUserId = staff.id;
    staffToken = staff.token;

    const unique = Date.now();
    const fixtures = await createCatalogFixtures(prisma, `prod-${unique}`);
    categoryId = fixtures.category.id;
    unitId = fixtures.unit.id;
    warehouseId = fixtures.warehouse.id;
  });

  afterAll(async () => {
    await prisma.billOfMaterialsItem.deleteMany({
      where: { billOfMaterialsId: { in: bomIds } },
    });
    await prisma.billOfMaterials.deleteMany({ where: { id: { in: bomIds } } });
    await prisma.productionOrder.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.stockMovement.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.warehouse.delete({ where: { id: warehouseId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.unit.delete({ where: { id: unitId } });
    await deleteUsers(prisma, [adminUserId, staffUserId]);
    await app.close();
  });

  async function createProduct(sku: string, name: string, type: ProductType) {
    const product = await prisma.product.create({
      data: { sku, name, type, categoryId, unitId },
    });
    productIds.push(product.id);
    return product.id;
  }

  async function stockUp(
    productId: string,
    quantity: number,
    unitCost?: number,
  ) {
    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity, unitCost })
      .expect(201);
  }

  async function createRecipe(
    finishedGoodId: string,
    components: { componentId: string; quantity: number }[],
  ) {
    const bom = await prisma.billOfMaterials.create({
      data: {
        productId: finishedGoodId,
        items: { create: components },
      },
    });
    bomIds.push(bom.id);
    return bom.id;
  }

  it('rejects creation by a non-ADMIN user', async () => {
    const finishedGoodId = await createProduct(
      `PO-RBAC-${Date.now()}`,
      'Producto RBAC',
      'FINISHED_GOOD',
    );

    await request(app.getHttpServer())
      .post('/production-orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ productId: finishedGoodId, warehouseId, quantity: 1 })
      .expect(403);
  });

  it('rejects an order for a product that is not a finished good', async () => {
    const rawMaterialId = await createProduct(
      `PO-RAW-${Date.now()}`,
      'Materia prima',
      'RAW_MATERIAL',
    );

    await request(app.getHttpServer())
      .post('/production-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: rawMaterialId, warehouseId, quantity: 1 })
      .expect(400);
  });

  it('rejects an order for a finished good with no active recipe', async () => {
    const finishedGoodId = await createProduct(
      `PO-NORECIPE-${Date.now()}`,
      'Sin receta',
      'FINISHED_GOOD',
    );

    await request(app.getHttpServer())
      .post('/production-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: finishedGoodId, warehouseId, quantity: 1 })
      .expect(400);
  });

  it('rejects an order when a recipe component lacks enough stock, listing the shortage', async () => {
    const unique = Date.now();
    const finishedGoodId = await createProduct(
      `PO-SHORT-FG-${unique}`,
      'Terminado escaso',
      'FINISHED_GOOD',
    );
    const componentId = await createProduct(
      `PO-SHORT-COMP-${unique}`,
      'Componente escaso',
      'RAW_MATERIAL',
    );
    await createRecipe(finishedGoodId, [{ componentId, quantity: 5 }]);
    await stockUp(componentId, 3);

    const response = await request(app.getHttpServer())
      .post('/production-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: finishedGoodId, warehouseId, quantity: 1 })
      .expect(400);

    const body = response.body as { shortages: { componentId: string }[] };
    expect(body.shortages).toEqual([
      expect.objectContaining({ componentId, required: '5', available: '3' }),
    ]);
  });

  it('creates the order when stock is sufficient, and it is readable by a non-ADMIN user', async () => {
    const unique = Date.now();
    const finishedGoodId = await createProduct(
      `PO-OK-FG-${unique}`,
      'Terminado disponible',
      'FINISHED_GOOD',
    );
    const componentId = await createProduct(
      `PO-OK-COMP-${unique}`,
      'Componente disponible',
      'RAW_MATERIAL',
    );
    await createRecipe(finishedGoodId, [{ componentId, quantity: 2 }]);
    await stockUp(componentId, 100);

    const createResponse = await request(app.getHttpServer())
      .post('/production-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: finishedGoodId, warehouseId, quantity: 10 })
      .expect(201);
    const created = createResponse.body as { id: string; status: string };
    expect(created.status).toBe('PENDIENTE');

    const getResponse = await request(app.getHttpServer())
      .get(`/production-orders/${created.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect((getResponse.body as { id: string }).id).toBe(created.id);

    const listResponse = await request(app.getHttpServer())
      .get('/production-orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    const list = listResponse.body as { data: { id: string }[] };
    expect(list.data.map((order) => order.id)).toContain(created.id);
  });

  it('returns 404 for a production order that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/production-orders/11111111-1111-4111-8111-111111111111')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(404);
  });

  describe('complete', () => {
    it('rejects completion by a non-ADMIN user', async () => {
      const unique = Date.now();
      const finishedGoodId = await createProduct(
        `PO-COMP-RBAC-FG-${unique}`,
        'Terminado RBAC',
        'FINISHED_GOOD',
      );
      const componentId = await createProduct(
        `PO-COMP-RBAC-COMP-${unique}`,
        'Componente RBAC',
        'RAW_MATERIAL',
      );
      await createRecipe(finishedGoodId, [{ componentId, quantity: 1 }]);
      await stockUp(componentId, 10);
      const createResponse = await request(app.getHttpServer())
        .post('/production-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: finishedGoodId, warehouseId, quantity: 1 })
        .expect(201);
      const orderId = (createResponse.body as { id: string }).id;

      await request(app.getHttpServer())
        .post(`/production-orders/${orderId}/complete`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);
    });

    it('costs the finished good by weighted average of the components consumed (ADR 0002)', async () => {
      const unique = Date.now();
      const finishedGoodId = await createProduct(
        `PO-COST-FG-${unique}`,
        'Terminado costeado',
        'FINISHED_GOOD',
      );
      const componentId = await createProduct(
        `PO-COST-COMP-${unique}`,
        'Componente costeado',
        'RAW_MATERIAL',
      );
      await createRecipe(finishedGoodId, [{ componentId, quantity: 5 }]);
      // Promedio ponderado del componente: (10*2 + 10*4) / 20 = 3.
      await stockUp(componentId, 10, 2);
      await stockUp(componentId, 10, 4);

      const createResponse = await request(app.getHttpServer())
        .post('/production-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: finishedGoodId, warehouseId, quantity: 2 })
        .expect(201);
      const orderId = (createResponse.body as { id: string }).id;

      const completeResponse = await request(app.getHttpServer())
        .post(`/production-orders/${orderId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      const completed = completeResponse.body as {
        totalCost: string;
        unitCost: string;
      };
      // required: 5*2=10 del componente a 3/u = 30 de costo total.
      // costo del terminado = 30 / 2 (order.quantity) = 15.
      expect(completed.totalCost).toBe('30');
      expect(completed.unitCost).toBe('15');

      const componentKardex = await request(app.getHttpServer())
        .get(`/inventory/${componentId}/kardex`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const componentSalida = (
        componentKardex.body as {
          data: { type: string; unitCost: string | null }[];
        }
      ).data.find((movement) => movement.type === 'SALIDA');
      expect(componentSalida?.unitCost).toBe('3');

      const finishedGoodKardex = await request(app.getHttpServer())
        .get(`/inventory/${finishedGoodId}/kardex`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const finishedGoodEntrada = (
        finishedGoodKardex.body as {
          data: { type: string; unitCost: string | null }[];
        }
      ).data.find((movement) => movement.type === 'ENTRADA');
      expect(finishedGoodEntrada?.unitCost).toBe('15');
    });

    it('returns 404 completing an order that does not exist', async () => {
      await request(app.getHttpServer())
        .post(
          '/production-orders/11111111-1111-4111-8111-111111111111/complete',
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('consumes components, enters the finished good, and marks the order COMPLETADA', async () => {
      const unique = Date.now();
      const finishedGoodId = await createProduct(
        `PO-COMP-OK-FG-${unique}`,
        'Terminado a producir',
        'FINISHED_GOOD',
      );
      const componentId = await createProduct(
        `PO-COMP-OK-COMP-${unique}`,
        'Componente a consumir',
        'RAW_MATERIAL',
      );
      await createRecipe(finishedGoodId, [{ componentId, quantity: 3 }]);
      await stockUp(componentId, 50);

      const createResponse = await request(app.getHttpServer())
        .post('/production-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: finishedGoodId, warehouseId, quantity: 5 })
        .expect(201);
      const orderId = (createResponse.body as { id: string }).id;

      const completeResponse = await request(app.getHttpServer())
        .post(`/production-orders/${orderId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      const completed = completeResponse.body as {
        status: string;
        completedAt: string | null;
      };
      expect(completed.status).toBe('COMPLETADA');
      expect(completed.completedAt).not.toBeNull();

      // Consumió 3*5=15 del componente (50 -> 35) y entró 5 del terminado.
      const componentStock = await request(app.getHttpServer())
        .get(`/inventory/${componentId}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect((componentStock.body as { stock: string }).stock).toBe('35');

      const finishedGoodStock = await request(app.getHttpServer())
        .get(`/inventory/${finishedGoodId}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect((finishedGoodStock.body as { stock: string }).stock).toBe('5');
    });

    it('rejects completing the same order twice', async () => {
      const unique = Date.now();
      const finishedGoodId = await createProduct(
        `PO-COMP-TWICE-FG-${unique}`,
        'Terminado doble',
        'FINISHED_GOOD',
      );
      const componentId = await createProduct(
        `PO-COMP-TWICE-COMP-${unique}`,
        'Componente doble',
        'RAW_MATERIAL',
      );
      await createRecipe(finishedGoodId, [{ componentId, quantity: 1 }]);
      await stockUp(componentId, 10);
      const createResponse = await request(app.getHttpServer())
        .post('/production-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: finishedGoodId, warehouseId, quantity: 1 })
        .expect(201);
      const orderId = (createResponse.body as { id: string }).id;

      await request(app.getHttpServer())
        .post(`/production-orders/${orderId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/production-orders/${orderId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('rejects completion when stock dropped below what is required in the meantime', async () => {
      const unique = Date.now();
      const finishedGoodId = await createProduct(
        `PO-COMP-DRAIN-FG-${unique}`,
        'Terminado drenado',
        'FINISHED_GOOD',
      );
      const componentId = await createProduct(
        `PO-COMP-DRAIN-COMP-${unique}`,
        'Componente drenado',
        'RAW_MATERIAL',
      );
      await createRecipe(finishedGoodId, [{ componentId, quantity: 5 }]);
      await stockUp(componentId, 10);
      const createResponse = await request(app.getHttpServer())
        .post('/production-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: finishedGoodId, warehouseId, quantity: 1 })
        .expect(201);
      const orderId = (createResponse.body as { id: string }).id;

      // Alguien más drena el componente entre crear y completar la orden.
      await request(app.getHttpServer())
        .post('/inventory/salidas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: componentId, warehouseId, quantity: 8 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/production-orders/${orderId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
      const body = response.body as { shortages: { componentId: string }[] };
      expect(body.shortages).toEqual([
        expect.objectContaining({ componentId, required: '5', available: '2' }),
      ]);
    });
  });
});
