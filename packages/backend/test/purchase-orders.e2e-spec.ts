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

interface PurchaseOrderBody {
  id: string;
  number: number;
  status: string;
  total: string;
  amountPaid: string;
  receivedValue: string;
  payable: string;
  paymentStatus: string;
  items: {
    id: string;
    productId: string;
    quantity: string;
    quantityReceived: string;
    receipts: { quantity: string; stockMovementId: string }[];
  }[];
  payments: { id: string; amount: string; voidedAt: string | null }[];
}

// Compras con varias líneas, recepción parcial y cuentas por pagar contra
// Postgres real (ADR 0010): lo que los tests unitarios con Prisma mockeado
// no pueden probar — que la recepción escribe de verdad la ENTRADA en el
// Kardex y que los saldos cuadran con lo que quedó guardado.
describe('Purchase orders (e2e)', () => {
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
  let supplierId: string;
  const productIds: string[] = [];

  function http() {
    return request(app.getHttpServer());
  }

  async function createPurchase(
    body: Record<string, unknown> = {},
  ): Promise<PurchaseOrderBody> {
    const response = await http()
      .post('/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        warehouseId,
        items: [
          { productId: productIds[0], quantity: 10, unitCost: 500 },
          { productId: productIds[1], quantity: 100, unitCost: 45 },
        ],
        ...body,
      })
      .expect(201);
    return response.body as PurchaseOrderBody;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'purchase-orders-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;
    const staff = await createUserAndLogin(app, prisma, {
      emailPrefix: 'purchase-orders-staff',
      roleName: 'STAFF',
    });
    staffUserId = staff.id;
    staffToken = staff.token;

    const unique = Date.now();
    const fixtures = await createCatalogFixtures(prisma, `po-${unique}`);
    categoryId = fixtures.category.id;
    unitId = fixtures.unit.id;
    warehouseId = fixtures.warehouse.id;

    const supplier = await prisma.supplier.create({
      data: { name: `Proveedor compras ${unique}` },
    });
    supplierId = supplier.id;

    for (const [sku, name] of [
      [`PO-A-${unique}`, 'Lámina de acero'],
      [`PO-B-${unique}`, 'Tornillo 4x16'],
    ]) {
      const product = await prisma.product.create({
        data: {
          sku,
          name,
          type: ProductType.RAW_MATERIAL,
          categoryId,
          unitId,
        },
      });
      productIds.push(product.id);
    }
  });

  afterAll(async () => {
    // Cascada: líneas, recepciones y pagos se van con la compra; las
    // ENTRADAs de la recepción se borran aparte (StockMovement no tiene
    // ON DELETE CASCADE hacia el producto).
    await prisma.purchaseOrder.deleteMany({ where: { supplierId } });
    await prisma.stockMovement.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.supplier.delete({ where: { id: supplierId } });
    await deleteCatalogFixtures(prisma, { categoryId, unitId, warehouseId });
    await deleteUsers(prisma, [adminUserId, staffUserId]);
    await app.close();
  });

  it('only lets an ADMIN register a purchase', async () => {
    await http()
      .post('/purchase-orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        supplierId,
        warehouseId,
        items: [{ productId: productIds[0], quantity: 1, unitCost: 1 }],
      })
      .expect(403);
  });

  it('rejects a repeated product and an advance bigger than the purchase', async () => {
    await http()
      .post('/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        warehouseId,
        items: [
          { productId: productIds[0], quantity: 1, unitCost: 1 },
          { productId: productIds[0], quantity: 2, unitCost: 1 },
        ],
      })
      .expect(400);

    await http()
      .post('/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        warehouseId,
        items: [{ productId: productIds[0], quantity: 1, unitCost: 100 }],
        initialPayment: { amount: 500, method: 'EFECTIVO' },
      })
      .expect(400);
  });

  it('runs a purchase from order to partial receipt, payment and closing', async () => {
    const created = await createPurchase({
      supplierInvoice: 'FV-2231',
      expectedDate: '2026-11-04',
      initialPayment: { amount: 2000, method: 'TRANSFERENCIA' },
    });
    expect(created.status).toBe('PENDIENTE');
    expect(Number(created.total)).toBe(9500);
    expect(Number(created.amountPaid)).toBe(2000);
    expect(created.paymentStatus).toBe('ABONADA');
    // Nada recibido todavía: el anticipo no deja deuda.
    expect(Number(created.payable)).toBe(0);
    const [steel, screws] = created.items;

    // Llega solo una parte de la lámina.
    const partial = await http()
      .post(`/purchase-orders/${created.id}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ itemId: steel.id, quantity: 6 }] })
      .expect(200);
    const afterPartial = partial.body as PurchaseOrderBody;
    expect(afterPartial.status).toBe('PARCIAL');
    expect(Number(afterPartial.receivedValue)).toBe(3000);
    expect(Number(afterPartial.payable)).toBe(1000);

    // La ENTRADA quedó en el Kardex con el costo de la compra.
    const movement = await prisma.stockMovement.findUniqueOrThrow({
      where: { id: afterPartial.items[0].receipts[0].stockMovementId },
    });
    expect(movement.type).toBe('ENTRADA');
    expect(movement.warehouseId).toBe(warehouseId);
    expect(Number(movement.quantity)).toBe(6);
    expect(Number(movement.unitCost)).toBe(500);

    // No se puede recibir más de lo que falta.
    await http()
      .post(`/purchase-orders/${created.id}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ itemId: steel.id, quantity: 5 }] })
      .expect(400);

    // Llegan los tornillos completos; la lámina restante no va a llegar.
    await http()
      .post(`/purchase-orders/${created.id}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ itemId: screws.id, quantity: 100 }] })
      .expect(200);

    // Pago que supera el saldo de la compra: rechazado.
    await http()
      .post(`/purchase-orders/${created.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 9000, method: 'EFECTIVO' })
      .expect(400);

    const paid = await http()
      .post(`/purchase-orders/${created.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 3000, method: 'EFECTIVO', note: 'Abono en caja' })
      .expect(201);
    const afterPayment = paid.body as PurchaseOrderBody;
    expect(Number(afterPayment.amountPaid)).toBe(5000);
    // Recibido: 6 x 500 + 100 x 45 = 7.500; pagado 5.000.
    expect(Number(afterPayment.payable)).toBe(2500);

    // El saldo del proveedor y el reporte cuadran con la compra.
    const balance = await http()
      .get(`/suppliers/${supplierId}/balance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Number((balance.body as { payable: string }).payable)).toBe(2500);

    const report = await http()
      .get('/reports/por-pagar')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = (report.body as { supplierId: string; balance: string }[]).find(
      (entry) => entry.supplierId === supplierId,
    );
    expect(Number(row?.balance)).toBe(2500);

    // Se cierra con lo recibido: el total pasa a ser lo que llegó.
    const closed = await http()
      .patch(`/purchase-orders/${created.id}/close`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const afterClose = closed.body as PurchaseOrderBody;
    expect(afterClose.status).toBe('CERRADA');
    expect(Number(afterClose.total)).toBe(7500);

    // Después de cerrada, no se recibe nada más.
    await http()
      .post(`/purchase-orders/${created.id}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ itemId: steel.id, quantity: 1 }] })
      .expect(400);

    // Anular el abono en caja devuelve la deuda.
    const paymentId = afterClose.payments.find(
      (payment) => Number(payment.amount) === 3000,
    )?.id;
    const voided = await http()
      .patch(`/purchase-orders/${created.id}/payments/${paymentId}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Se registró dos veces' })
      .expect(200);
    expect(Number((voided.body as PurchaseOrderBody).payable)).toBe(5500);
  });

  it('cancels a purchase with nothing received, and lists and finds purchases', async () => {
    const created = await createPurchase();

    const listed = await http()
      .get(`/purchase-orders?search=${created.number}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((listed.body as { data: { id: string }[] }).data[0].id).toBe(
      created.id,
    );

    const open = await http()
      .get(`/purchase-orders?supplierId=${supplierId}&open=true`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (open.body as { data: { id: string }[] }).data.map((order) => order.id),
    ).toContain(created.id);

    await http()
      .patch(`/purchase-orders/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ supplierInvoice: 'FV-9', notes: 'Llamar antes de entregar' })
      .expect(200);

    const cancelled = await http()
      .patch(`/purchase-orders/${created.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((cancelled.body as PurchaseOrderBody).status).toBe('CANCELADA');

    const detail = await http()
      .get(`/purchase-orders/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body).toEqual(
      expect.objectContaining({
        status: 'CANCELADA',
        supplierInvoice: 'FV-9',
      }),
    );

    await http()
      .get('/purchase-orders/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
