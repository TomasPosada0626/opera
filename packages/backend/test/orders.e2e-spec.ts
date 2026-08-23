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
    await prisma.remissionItem.deleteMany({
      where: { remission: { order: { id: { in: orderIds } } } },
    });
    await prisma.remission.deleteMany({
      where: { order: { id: { in: orderIds } } },
    });
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

  it('creates an order PENDIENTE without touching stock', async () => {
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

    // Este negocio fabrica sobre pedido — crear el pedido no debe mover
    // stock en absoluto, a diferencia del diseño original.
    const stock = await request(app.getHttpServer())
      .get(`/inventory/${productId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((stock.body as { stock: string }).stock).toBe('0');

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

  it('filters the list by status', async () => {
    const created = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId,
        warehouseId,
        items: [{ productId, quantity: 1, unitPrice: 10 }],
      })
      .expect(201);
    const orderId = (created.body as { id: string }).id;
    orderIds.push(orderId);

    await request(app.getHttpServer())
      .patch(`/orders/${orderId}/mark-production`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const inProduction = await request(app.getHttpServer())
      .get('/orders?status=EN_PRODUCCION')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const inProductionBody = inProduction.body as { data: { id: string }[] };
    expect(inProductionBody.data.some((order) => order.id === orderId)).toBe(
      true,
    );

    const pending = await request(app.getHttpServer())
      .get('/orders?status=PENDIENTE')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const pendingBody = pending.body as { data: { id: string }[] };
    expect(pendingBody.data.some((order) => order.id === orderId)).toBe(false);
  });

  it('returns 404 for an order that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/orders/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('rejects mark-production and mark-warehoused when the order is in the wrong status', async () => {
    const created = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId,
        warehouseId,
        items: [{ productId, quantity: 1, unitPrice: 10 }],
      })
      .expect(201);
    const orderId = (created.body as { id: string }).id;
    orderIds.push(orderId);

    // Todavía PENDIENTE — marcar enviado a almacén sin pasar por producción
    // primero debe rechazarse.
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/mark-warehoused`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/orders/${orderId}/mark-production`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Ya está EN_PRODUCCION — marcarlo en producción de nuevo debe rechazarse.
    await request(app.getHttpServer())
      .patch(`/orders/${orderId}/mark-production`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('runs the full lifecycle: producción -> almacén -> despacho, moviendo stock solo cuando corresponde', async () => {
    const created = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId,
        warehouseId,
        items: [{ productId, quantity: 5, unitPrice: 40 }],
      })
      .expect(201);
    const order = created.body as {
      id: string;
      items: { id: string }[];
    };
    orderIds.push(order.id);
    const orderItemId = order.items[0].id;

    const marked = await request(app.getHttpServer())
      .patch(`/orders/${order.id}/mark-production`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((marked.body as { status: string }).status).toBe('EN_PRODUCCION');
    expect(
      (marked.body as { productionStartedAt: string | null })
        .productionStartedAt,
    ).not.toBeNull();

    // Todavía nada en stock — "en producción" es solo una bandera.
    const stockDuringProduction = await request(app.getHttpServer())
      .get(`/inventory/${productId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((stockDuringProduction.body as { stock: string }).stock).toBe('0');

    const warehoused = await request(app.getHttpServer())
      .post(`/orders/${order.id}/mark-warehoused`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect((warehoused.body as { status: string }).status).toBe('EN_ALMACEN');

    // El terminado entra al stock de verdad acá — cantidad completa pedida.
    const stockAfterWarehoused = await request(app.getHttpServer())
      .get(`/inventory/${productId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((stockAfterWarehoused.body as { stock: string }).stock).toBe('5');

    // Un ajuste externo se lleva 4 unidades (ej. una pieza dañada) — deja
    // menos stock real del que el pedido todavía "cree" tener disponible,
    // para demostrar que el chequeo de stock de la remisión es contra el
    // stock de verdad, no solo contra lo pendiente por entregar del pedido.
    await request(app.getHttpServer())
      .post('/inventory/ajustes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity: -4, reason: 'Pieza dañada' })
      .expect(201);

    const shortageResponse = await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId: order.id,
        paymentStatus: 'CARTERA',
        items: [{ orderItemId, quantity: 5 }],
      })
      .expect(400);
    expect(
      (shortageResponse.body as { shortages: unknown[] }).shortages,
    ).toHaveLength(1);

    // Despachar lo que sí hay stock real para cubrir (1) sí debe pasar.
    const remission = await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId: order.id,
        paymentStatus: 'ABONADO',
        amountPaid: 20,
        items: [{ orderItemId, quantity: 1 }],
      })
      .expect(201);
    expect((remission.body as { paymentStatus: string }).paymentStatus).toBe(
      'ABONADO',
    );

    const finalStock = await request(app.getHttpServer())
      .get(`/inventory/${productId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((finalStock.body as { stock: string }).stock).toBe('0'); // 5 - 4 - 1
  });
});
