import { INestApplication } from '@nestjs/common';
import { ProductType } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/test-app';
import {
  createUserAndLogin,
  createCatalogFixtures,
  deleteCatalogFixtures,
  deleteUsers,
} from './support/fixtures';

describe('Search (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminUserId: string;
  let categoryId: string;
  let unitId: string;
  let warehouseId: string;
  let productId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'search-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;

    const unique = Date.now();
    const fixtures = await createCatalogFixtures(prisma, `search-${unique}`);
    categoryId = fixtures.category.id;
    unitId = fixtures.unit.id;
    warehouseId = fixtures.warehouse.id;

    const product = await prisma.product.create({
      data: {
        sku: `SRCH-${unique}`,
        name: `Silla buscable ${unique}`,
        type: ProductType.FINISHED_GOOD,
        categoryId,
        unitId,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.product.delete({ where: { id: productId } });
    await deleteCatalogFixtures(prisma, { categoryId, unitId, warehouseId });
    await deleteUsers(prisma, [adminUserId]);
    await app.close();
  });

  it('GET /search finds the product by a substring of its name', async () => {
    const response = await request(app.getHttpServer())
      .get('/search')
      .query({ q: 'buscable' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = response.body as {
      products: { id: string }[];
      customers: unknown[];
      suppliers: unknown[];
      remissions: unknown[];
      productionOrders: unknown[];
    };
    expect(body.products.some((p) => p.id === productId)).toBe(true);
    expect(body.customers).toEqual([]);
    expect(body.suppliers).toEqual([]);
    expect(body.remissions).toEqual([]);
    expect(body.productionOrders).toEqual([]);
  });

  it('GET /search rejects an empty term', async () => {
    await request(app.getHttpServer())
      .get('/search')
      .query({ q: '' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('GET /search requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/search')
      .query({ q: 'silla' })
      .expect(401);
  });
});
