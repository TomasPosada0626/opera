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

describe('Remissions (e2e)', () => {
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
  let orderId: string;
  let orderItemId: string;
  const remissionIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'remissions-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;

    const unique = Date.now();
    const fixtures = await createCatalogFixtures(prisma, `rem-${unique}`);
    categoryId = fixtures.category.id;
    unitId = fixtures.unit.id;
    warehouseId = fixtures.warehouse.id;

    const product = await prisma.product.create({
      data: {
        sku: `REM-${unique}`,
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

    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity: 10, unitCost: 5 })
      .expect(201);

    const orderResponse = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId,
        warehouseId,
        items: [{ productId, quantity: 10, unitPrice: 20 }],
      })
      .expect(201);
    const createdOrder = orderResponse.body as {
      id: string;
      items: { id: string }[];
    };
    orderId = createdOrder.id;
    orderItemId = createdOrder.items[0].id;
  });

  afterAll(async () => {
    await prisma.remissionItem.deleteMany({
      where: { remissionId: { in: remissionIds } },
    });
    await prisma.remission.deleteMany({ where: { id: { in: remissionIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
    await deleteCatalogFixtures(prisma, { categoryId, unitId, warehouseId });
    await deleteUsers(prisma, [adminUserId]);
    await app.close();
  });

  it('rejects creation for an order line that does not belong to the order', async () => {
    // UUID v4 sintácticamente válido pero que no existe — no el nulo
    // (00000000-...), que @IsUUID('4') rechaza por formato antes de que el
    // servicio llegue a buscarlo (mismo detalle que orders.e2e-spec.ts).
    await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId,
        items: [
          { orderItemId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', quantity: 1 },
        ],
      })
      .expect(404);
  });

  it('rejects a quantity that exceeds what remains to be delivered', async () => {
    const response = await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId, items: [{ orderItemId, quantity: 999 }] })
      .expect(400);
    expect((response.body as { overages: unknown[] }).overages).toHaveLength(1);
  });

  it('creates a partial remission, then a second one for the remainder', async () => {
    const first = await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId, items: [{ orderItemId, quantity: 6 }] })
      .expect(201);
    const firstBody = first.body as { id: string; number: number };
    remissionIds.push(firstBody.id);
    expect(firstBody.number).toBeGreaterThan(0);

    // Ya se entregaron 6 de 10 — pedir 5 más debe fallar (solo quedan 4).
    await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId, items: [{ orderItemId, quantity: 5 }] })
      .expect(400);

    // Pedir exactamente lo que queda (4) sí debe pasar.
    const second = await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId, items: [{ orderItemId, quantity: 4 }] })
      .expect(201);
    remissionIds.push((second.body as { id: string }).id);

    await request(app.getHttpServer())
      .get(`/remissions/${firstBody.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = list.body as { data: { id: string }[] };
    expect(body.data.some((r) => r.id === firstBody.id)).toBe(true);
  });

  it('returns a PDF document for a remission', async () => {
    const created = await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId, items: [{ orderItemId, quantity: 0.5 }] })
      .expect(400); // no queda nada por entregar tras el test anterior

    // El pedido ya quedó completamente remisionado por el test anterior —
    // confirma explícitamente que no queda nada, luego pide el PDF de una
    // remisión ya existente en vez de crear una nueva.
    expect((created.body as { overages: unknown[] }).overages).toHaveLength(1);

    const pdfResponse = await request(app.getHttpServer())
      .get(`/remissions/${remissionIds[0]}/pdf`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(pdfResponse.headers['content-type']).toContain('application/pdf');
    expect((pdfResponse.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('returns 404 for a remission that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/remissions/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
