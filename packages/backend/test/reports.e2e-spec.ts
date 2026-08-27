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

// superagent no bufferiza a Buffer por defecto el content-type de .xlsx —
// sin este parser explícito, response.body llega como {} en vez de bytes.
// Patrón estándar de supertest/superagent para respuestas binarias.
function binaryParser(
  res: NodeJS.EventEmitter & { setEncoding: (encoding: string) => void },
  callback: (err: Error | null, body: Buffer) => void,
): void {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk: string) => {
    data += chunk;
  });
  res.on('end', () => callback(null, Buffer.from(data, 'binary')));
}

// Los tres endpoints solo tenían cobertura unitaria (Prisma mockeado) —
// nunca se probaron sobre HTTP/Postgres real (encontrado en la auditoría de
// cobertura de pruebas, 2026-08-22).
describe('Reports (e2e)', () => {
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
  const remissionIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'reports-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;

    const unique = Date.now();
    const fixtures = await createCatalogFixtures(prisma, `reports-${unique}`);
    categoryId = fixtures.category.id;
    unitId = fixtures.unit.id;
    warehouseId = fixtures.warehouse.id;

    const product = await prisma.product.create({
      data: {
        sku: `REP-${unique}`,
        name: 'Producto de prueba de reportes',
        type: ProductType.FINISHED_GOOD,
        categoryId,
        unitId,
      },
    });
    productId = product.id;

    const customer = await prisma.customer.create({
      data: { name: `Cliente de reportes ${unique}` },
    });
    customerId = customer.id;

    // 10 de costo 5 c/u -> costo promedio 5. Vende 4 a 25 c/u -> stock 6,
    // valor 30, ingresos 100. El pedido ya no descuenta stock al crearse —
    // la remisión (despacho) es la que de verdad lo mueve, así que hace
    // falta despachar explícitamente para llegar a los mismos números.
    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity: 10, unitCost: 5 })
      .expect(201);

    const order = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId,
        warehouseId,
        items: [{ productId, quantity: 4, unitPrice: 25 }],
      })
      .expect(201);
    const createdOrder = order.body as { id: string; items: { id: string }[] };
    orderIds.push(createdOrder.id);

    // Una remisión solo despacha un pedido EN_ALMACEN (#80, revisión de
    // seguridad de cierre de M6). Se actualiza directo por Prisma, no vía
    // mark-production/mark-warehoused: ese flujo real escribiría su propia
    // ENTRADA por la cantidad del pedido, descuadrando el costo/stock
    // exacto que este test ya arma a mano arriba (10 a costo 5).
    await prisma.order.update({
      where: { id: createdOrder.id },
      data: { status: 'EN_ALMACEN' },
    });

    const remission = await request(app.getHttpServer())
      .post('/remissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId: createdOrder.id,
        paymentStatus: 'PAGADO',
        items: [{ orderItemId: createdOrder.items[0].id, quantity: 4 }],
      })
      .expect(201);
    remissionIds.push((remission.body as { id: string }).id);
  });

  afterAll(async () => {
    await prisma.remissionItem.deleteMany({
      where: { remissionId: { in: remissionIds } },
    });
    await prisma.remission.deleteMany({ where: { id: { in: remissionIds } } });
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

  it('GET /reports/inventario values the product at its real weighted-average cost', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports/inventario')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const rows = response.body as {
      id: string;
      stock: string;
      averageCost: string;
      stockValue: string;
    }[];
    const row = rows.find((r) => r.id === productId);
    expect(row).toBeDefined();
    expect(row?.stock).toBe('6');
    expect(row?.averageCost).toBe('5');
    expect(row?.stockValue).toBe('30');
  });

  it('GET /reports/inventario/excel returns an .xlsx file', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports/inventario/excel')
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(response.headers['content-type']).toContain('spreadsheetml');
    // Todo archivo .xlsx es un zip — empieza con la firma "PK".
    expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('GET /reports/ventas totals the order just created', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports/ventas')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = response.body as {
      orderCount: number;
      totalQuantity: string;
      totalRevenue: string;
    };
    expect(body.orderCount).toBeGreaterThanOrEqual(1);
    expect(Number(body.totalQuantity)).toBeGreaterThanOrEqual(4);
    expect(Number(body.totalRevenue)).toBeGreaterThanOrEqual(100);
  });

  it('GET /reports/ventas/excel returns an .xlsx file', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports/ventas/excel')
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(response.headers['content-type']).toContain('spreadsheetml');
    expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('GET /reports/ventas excludes everything outside the given date range', async () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const response = await request(app.getHttpServer())
      .get(`/reports/ventas?from=${farFuture}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = response.body as {
      orderCount: number;
      totalQuantity: string;
      totalRevenue: string;
    };
    expect(body.orderCount).toBe(0);
    expect(body.totalQuantity).toBe('0');
    expect(body.totalRevenue).toBe('0');
  });

  it('GET /reports/productos-mas-vendidos ranks the product just sold', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports/productos-mas-vendidos')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const rows = response.body as {
      productId: string;
      quantitySold: string;
      revenue: string;
    }[];
    const row = rows.find((r) => r.productId === productId);
    expect(row).toBeDefined();
    expect(row?.quantitySold).toBe('4');
    expect(row?.revenue).toBe('100');
  });

  it('GET /reports/productos-mas-vendidos/excel returns an .xlsx file', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports/productos-mas-vendidos/excel')
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(response.headers['content-type']).toContain('spreadsheetml');
    expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });
});
