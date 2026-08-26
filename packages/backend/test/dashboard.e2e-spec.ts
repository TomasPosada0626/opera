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

// Solo verifica que el endpoint agregue de verdad sobre datos reales de
// varios módulos (producción, pedidos, compras, auditoría) — la forma
// exacta de cada sección ya está cubierta por dashboard.service.spec.ts
// con Prisma mockeado.
describe('Dashboard (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminUserId: string;
  let categoryId: string;
  let unitId: string;
  let warehouseId: string;
  let supplierId: string;
  let supplierName: string;
  let customerId: string;
  let customerName: string;
  let productId: string;
  let orderId: string;
  let purchaseId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'dashboard-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;

    const unique = Date.now();
    const fixtures = await createCatalogFixtures(prisma, `dash-${unique}`);
    categoryId = fixtures.category.id;
    unitId = fixtures.unit.id;
    warehouseId = fixtures.warehouse.id;

    supplierName = `Proveedor dashboard ${unique}`;
    const supplier = await prisma.supplier.create({
      data: { name: supplierName },
    });
    supplierId = supplier.id;

    customerName = `Cliente dashboard ${unique}`;
    const customer = await prisma.customer.create({
      data: { name: customerName },
    });
    customerId = customer.id;

    const product = await prisma.product.create({
      data: {
        sku: `DASH-${unique}`,
        name: 'Producto de prueba de dashboard',
        type: ProductType.FINISHED_GOOD,
        categoryId,
        unitId,
      },
    });
    productId = product.id;

    const purchase = await prisma.supplierPurchase.create({
      data: {
        supplierId,
        productId,
        quantity: 10,
        unitCost: 5,
        userId: adminUserId,
      },
    });
    purchaseId = purchase.id;

    const order = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId,
        warehouseId,
        items: [{ productId, quantity: 3, unitPrice: 40 }],
      })
      .expect(201);
    orderId = (order.body as { id: string }).id;
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.supplierPurchase.deleteMany({ where: { id: purchaseId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.supplier.delete({ where: { id: supplierId } });
    await prisma.product.delete({ where: { id: productId } });
    await deleteCatalogFixtures(prisma, { categoryId, unitId, warehouseId });
    await deleteUsers(prisma, [adminUserId]);
    await app.close();
  });

  it('GET /dashboard/resumen aggregates orders, purchases and activity from real data', async () => {
    const response = await request(app.getHttpServer())
      .get('/dashboard/resumen')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = response.body as {
      orders: Record<string, number>;
      recentPurchases: {
        id: string;
        supplierName: string;
        productName: string;
      }[];
      recentSales: { id: string; customerName: string; total: string }[];
      recentActivity: { entity: string; entityId: string; action: string }[];
    };

    expect(body.orders.PENDIENTE).toBeGreaterThanOrEqual(1);

    const purchaseRow = body.recentPurchases.find((p) => p.id === purchaseId);
    expect(purchaseRow).toEqual(
      expect.objectContaining({
        supplierName,
        productName: 'Producto de prueba de dashboard',
      }),
    );

    const saleRow = body.recentSales.find((s) => s.id === orderId);
    expect(saleRow).toEqual(
      expect.objectContaining({ customerName, total: '120' }),
    );

    const activityRow = body.recentActivity.find(
      (entry) => entry.entity === 'Order' && entry.entityId === orderId,
    );
    expect(activityRow).toEqual(expect.objectContaining({ action: 'CREATE' }));
  });

  it('GET /dashboard/resumen requires authentication', async () => {
    await request(app.getHttpServer()).get('/dashboard/resumen').expect(401);
  });
});
