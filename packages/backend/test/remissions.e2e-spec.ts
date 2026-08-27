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
  let staffToken: string;
  let staffUserId: string;
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

    const staff = await createUserAndLogin(app, prisma, {
      emailPrefix: 'remissions-staff',
    });
    staffUserId = staff.id;
    staffToken = staff.token;

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

    // Una remisión solo puede despachar un pedido que ya llegó a almacén
    // (#80, revisión de seguridad de cierre de M6) — sin esto, todo el
    // resto de este spec fallaría con 400 "Solo se puede despachar...".
    // markWarehoused es lo que de verdad entra las 10 unidades al stock
    // real (ya no un /inventory/entradas manual aparte, que dejaría el
    // doble de stock del que este spec espera).
    await request(app.getHttpServer())
      .patch(`/orders/${orderId}/mark-production`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/mark-warehoused`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
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
    await deleteUsers(prisma, [adminUserId, staffUserId]);
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
        paymentStatus: 'CARTERA',
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
      .send({
        orderId,
        paymentStatus: 'CARTERA',
        items: [{ orderItemId, quantity: 999 }],
      })
      .expect(400);
    expect((response.body as { overages: unknown[] }).overages).toHaveLength(1);
  });

  it('creates a partial remission, then a second one for the remainder', async () => {
    const first = await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId,
        paymentStatus: 'ABONADO',
        amountPaid: 60,
        items: [{ orderItemId, quantity: 6 }],
      })
      .expect(201);
    const firstBody = first.body as { id: string; number: number };
    remissionIds.push(firstBody.id);
    expect(firstBody.number).toBeGreaterThan(0);

    // El pedido ya no descuenta stock al crearse — la remisión es la que
    // de verdad lo mueve. 10 reales, se despachan 6 -> quedan 4.
    const stockAfterFirst = await request(app.getHttpServer())
      .get(`/inventory/${productId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((stockAfterFirst.body as { stock: string }).stock).toBe('4');

    const paymentUpdate = await request(app.getHttpServer())
      .patch(`/remissions/${firstBody.id}/payment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentStatus: 'PAGADO' })
      .expect(200);
    expect(
      (paymentUpdate.body as { paymentStatus: string }).paymentStatus,
    ).toBe('PAGADO');

    // Ya se entregaron 6 de 10 — pedir 5 más debe fallar (solo quedan 4).
    await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId,
        paymentStatus: 'CARTERA',
        items: [{ orderItemId, quantity: 5 }],
      })
      .expect(400);

    // Pedir exactamente lo que queda (4) sí debe pasar.
    const second = await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId,
        paymentStatus: 'PAGADO',
        items: [{ orderItemId, quantity: 4 }],
      })
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
      .send({
        orderId,
        paymentStatus: 'CARTERA',
        items: [{ orderItemId, quantity: 0.5 }],
      })
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

  it('rejects voiding a remission by a non-ADMIN user', async () => {
    await request(app.getHttpServer())
      .patch(`/remissions/${remissionIds[1]}/void`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ reason: 'Cantidad equivocada' })
      .expect(403);
  });

  it('voids a remission, reverses the stock, and frees the delivered quantity for a new dispatch', async () => {
    // El pedido quedó completamente remisionado (6 + 4 = 10) por el test de
    // despacho parcial — anular la segunda remisión (4) debe devolver esas
    // 4 unidades al stock real y a lo que el pedido admite despachar.
    const stockBefore = await request(app.getHttpServer())
      .get(`/inventory/${productId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const voided = await request(app.getHttpServer())
      .patch(`/remissions/${remissionIds[1]}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Cantidad equivocada' })
      .expect(200);
    expect(
      (voided.body as { voidedAt: string | null }).voidedAt,
    ).not.toBeNull();

    const stockAfter = await request(app.getHttpServer())
      .get(`/inventory/${productId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Number((stockAfter.body as { stock: string }).stock)).toBe(
      Number((stockBefore.body as { stock: string }).stock) + 4,
    );

    // La cantidad anulada ya no cuenta como "entregada" — el pedido vuelve
    // a admitir un despacho de esas 4 unidades.
    const redispatch = await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId,
        paymentStatus: 'CARTERA',
        items: [{ orderItemId, quantity: 4 }],
      })
      .expect(201);
    remissionIds.push((redispatch.body as { id: string }).id);
  });

  it('rejects voiding an already-voided remission', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/remissions/${remissionIds[1]}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Otro intento' })
      .expect(400);
    expect((response.body as { message: string }).message).toContain('anulada');
  });

  it('returns 404 for a remission that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/remissions/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
