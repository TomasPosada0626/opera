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

  async function stockUp(productId: string, quantity: number) {
    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity })
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
});
