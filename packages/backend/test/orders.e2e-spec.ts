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

describe('Orders (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminUserId: string;
  let categoryId: string;
  let unitId: string;
  let warehouseId: string;
  let customerId: string;
  let productId: string;
  const orderIds: string[] = [];

  async function entrada(quantity: number) {
    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity, unitCost: 5 })
      .expect(201);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'orders-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;

    const unique = Date.now();
    const fixtures = await createCatalogFixtures(prisma, `orders-${unique}`);
    categoryId = fixtures.category.id;
    unitId = fixtures.unit.id;
    warehouseId = fixtures.warehouse.id;

    const product = await prisma.product.create({
      data: {
        sku: `ORD-${unique}`,
        name: 'Silla de madera',
        type: ProductType.FINISHED_GOOD,
        categoryId,
        unitId,
      },
    });
    productId = product.id;

    const customer = await prisma.customer.create({
      data: { name: `Cliente de prueba ${unique}` },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({
      where: { order: { id: { in: orderIds } } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
    await deleteCatalogFixtures(prisma, { categoryId, unitId, warehouseId });
    await deleteUsers(prisma, [adminUserId]);
    await app.close();
  });

  it('rejects creation with an empty items array', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerId, warehouseId, items: [] })
      .expect(400);
  });

  it('rejects creation for a customer that does not exist', async () => {
    // UUID v4 sintácticamente válido pero que no existe — no el nulo
    // (00000000-...), que @IsUUID('4') rechaza por formato (bit de versión
    // en 0, no 4) antes de que el servicio llegue a buscarlo.
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        warehouseId,
        items: [{ productId, quantity: 1, unitPrice: 10 }],
      })
      .expect(404);
  });

  it('rejects creation when stock is insufficient and does not move any stock', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId,
        warehouseId,
        items: [{ productId, quantity: 999, unitPrice: 10 }],
      })
      .expect(400);
    expect((response.body as { shortages: unknown[] }).shortages).toHaveLength(
      1,
    );

    const stock = await request(app.getHttpServer())
      .get(`/inventory/${productId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((stock.body as { stock: string }).stock).toBe('0');
  });

  it('creates an order, discounts stock, and is readable via list and detail', async () => {
    await entrada(10);

    const createResponse = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId,
        warehouseId,
        items: [{ productId, quantity: 3, unitPrice: 25 }],
      })
      .expect(201);
    const created = createResponse.body as {
      id: string;
      status: string;
      items: { productId: string; quantity: string; unitPrice: string }[];
    };
    orderIds.push(created.id);
    expect(created.status).toBe('PENDIENTE');
    expect(created.items).toHaveLength(1);
    expect(created.items[0].productId).toBe(productId);

    const stock = await request(app.getHttpServer())
      .get(`/inventory/${productId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((stock.body as { stock: string }).stock).toBe('7'); // 10 - 3

    await request(app.getHttpServer())
      .get(`/orders/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = list.body as { data: { id: string }[] };
    expect(body.data.some((order) => order.id === created.id)).toBe(true);
  });

  it('returns 404 for an order that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/orders/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
