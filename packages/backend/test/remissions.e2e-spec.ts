import { INestApplication } from '@nestjs/common';
import { ProductType } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
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

  let app: INestApplication<App>;
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
    // Todos los pedidos del cliente de prueba, no solo el principal (el
    // test de IVA crea uno propio).
    await prisma.orderItem.deleteMany({ where: { order: { customerId } } });
    await prisma.order.deleteMany({ where: { customerId } });
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
        initialPayment: { amount: 60, method: 'EFECTIVO' },
        items: [{ orderItemId, quantity: 6 }],
      })
      .expect(201);
    const firstBody = first.body as { id: string; number: number };
    remissionIds.push(firstBody.id);
    // El consecutivo sigue al talonario en papel de Herrajes Toro (migración
    // 20261026180000_remisiones_desde_ht_3286).
    expect(firstBody.number).toBeGreaterThanOrEqual(3286);

    // Y se encuentra tal como sale impresa: "HT <número>".
    const found = await request(app.getHttpServer())
      .get(`/remissions?search=${encodeURIComponent(`HT ${firstBody.number}`)}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((found.body as { data: { id: string }[] }).data[0]?.id).toBe(
      firstBody.id,
    );

    // El pedido ya no descuenta stock al crearse — la remisión es la que
    // de verdad lo mueve. 10 reales, se despachan 6 -> quedan 4.
    const stockAfterFirst = await request(app.getHttpServer())
      .get(`/inventory/${productId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((stockAfterFirst.body as { stock: string }).stock).toBe('4');

    // 6 x 20 = 120. Abonó 60 al recibir; un abono de 80 se pasa del saldo.
    await request(app.getHttpServer())
      .post(`/remissions/${firstBody.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 80, method: 'TRANSFERENCIA' })
      .expect(400);
    const paymentUpdate = await request(app.getHttpServer())
      .post(`/remissions/${firstBody.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 60, method: 'TRANSFERENCIA', note: 'Bancolombia' })
      .expect(201);
    const paid = paymentUpdate.body as {
      paymentStatus: string;
      amountPaid: string;
      payments: { amount: string; method: string }[];
    };
    expect(paid.paymentStatus).toBe('PAGADO');
    expect(Number(paid.amountPaid)).toBe(120);
    expect(paid.payments).toHaveLength(2);

    // Ya se entregaron 6 de 10 — pedir 5 más debe fallar (solo quedan 4).
    await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId,
        items: [{ orderItemId, quantity: 5 }],
      })
      .expect(400);

    // Pedir exactamente lo que queda (4) sí debe pasar.
    const second = await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId,
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

  it('marks the order DESPACHADO once every line is fully dispatched', async () => {
    const order = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = order.body as { status: string; dispatchedAt: string | null };
    expect(body.status).toBe('DESPACHADO');
    expect(body.dispatchedAt).not.toBeNull();
  });

  it('refuses to void a remission that still has valid payments', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/remissions/${remissionIds[0]}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Prueba' })
      .expect(400);
    expect((response.body as { message: string }).message).toContain(
      'abonos registrados',
    );
  });

  it('voids a payment, keeping it in the history and lowering what was paid', async () => {
    const remission = await request(app.getHttpServer())
      .get(`/remissions/${remissionIds[0]}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const { payments } = remission.body as {
      payments: { id: string; voidedAt: string | null }[];
    };

    await request(app.getHttpServer())
      .patch(`/remissions/${remissionIds[0]}/payments/${payments[1].id}/void`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ reason: 'Transferencia rechazada' })
      .expect(403);

    const voided = await request(app.getHttpServer())
      .patch(`/remissions/${remissionIds[0]}/payments/${payments[1].id}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Transferencia rechazada' })
      .expect(200);
    const body = voided.body as {
      paymentStatus: string;
      amountPaid: string;
      payments: { voidedAt: string | null; voidReason: string | null }[];
    };
    expect(body.paymentStatus).toBe('ABONADO');
    expect(Number(body.amountPaid)).toBe(60);
    expect(body.payments).toHaveLength(2);
    expect(body.payments[1].voidReason).toBe('Transferencia rechazada');

    await request(app.getHttpServer())
      .patch(`/remissions/${remissionIds[0]}/payments/${payments[1].id}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Otra vez' })
      .expect(400);
  });

  it('filters remissions by payment status and customer', async () => {
    const response = await request(app.getHttpServer())
      .get('/remissions')
      .query({ paymentStatus: 'ABONADO', customerId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = response.body as { data: { id: string }[] };
    expect(body.data.map((remission) => remission.id)).toEqual([
      remissionIds[0],
    ]);
  });

  it('returns a PDF document for a remission', async () => {
    const created = await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId,
        items: [{ orderItemId, quantity: 0.5 }],
      })
      .expect(400); // no queda nada por entregar tras el test anterior

    // El pedido ya quedó completamente remisionado (DESPACHADO) por el test
    // anterior — confirma explícitamente que no queda nada, luego pide el
    // PDF de una remisión ya existente en vez de crear una nueva.
    expect((created.body as { message: string }).message).toContain(
      'ya se despachó por completo',
    );

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
        items: [{ orderItemId, quantity: 4 }],
      })
      .expect(201);
    remissionIds.push((redispatch.body as { id: string }).id);

    // Al anular, el pedido volvió a EN_ALMACEN; el redespacho lo completa
    // de nuevo.
    const order = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((order.body as { status: string }).status).toBe('DESPACHADO');
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

  // No todas las ventas llevan IVA: se elige por pedido y la remisión lo
  // suma al total que el cliente debe. Una vez remisionado, ya no cambia.
  it('adds the order VAT to the remission total and then locks it', async () => {
    const orderResponse = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId,
        warehouseId,
        vatRate: 19,
        items: [{ productId, quantity: 5, unitPrice: 20 }],
      })
      .expect(201);
    const vatOrder = orderResponse.body as {
      id: string;
      vatRate: string;
      items: { id: string }[];
    };
    expect(Number(vatOrder.vatRate)).toBe(19);
    await request(app.getHttpServer())
      .patch(`/orders/${vatOrder.id}/mark-production`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/orders/${vatOrder.id}/mark-warehoused`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const remissionResponse = await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId: vatOrder.id,
        items: [{ orderItemId: vatOrder.items[0].id, quantity: 5 }],
      })
      .expect(201);
    const remission = remissionResponse.body as {
      id: string;
      subtotal: string;
      vatAmount: string;
      total: string;
    };
    remissionIds.push(remission.id);
    // 5 × 20 = 100; IVA 19 % = 19; total 119.
    expect(Number(remission.subtotal)).toBe(100);
    expect(Number(remission.vatAmount)).toBe(19);
    expect(Number(remission.total)).toBe(119);

    await request(app.getHttpServer())
      .patch(`/orders/${vatOrder.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vatRate: 0 })
      .expect(400);
  });
});
