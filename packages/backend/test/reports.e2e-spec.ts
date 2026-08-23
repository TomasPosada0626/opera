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
    // valor 30, ingresos 100.
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
    orderIds.push((order.body as { id: string }).id);
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
});
