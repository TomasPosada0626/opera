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

describe('Customers (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminUserId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'customers-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({ where: { id: { in: createdIds } } });
    await deleteUsers(prisma, [adminUserId]);
    await app.close();
  });

  it('rejects creation with an invalid payload (empty name)', async () => {
    await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '' })
      .expect(400);
  });

  it('rejects creation with an invalid email', async () => {
    await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cliente de prueba', email: 'no-es-un-correo' })
      .expect(400);
  });

  it('creates, reads, updates, deactivates, and reactivates a customer', async () => {
    const unique = `E2E-CRUD-${Date.now()}`;

    const createResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: unique, taxId: `${unique}-NIT` })
      .expect(201);
    const created = createResponse.body as { id: string; name: string };
    createdIds.push(created.id);
    expect(created.name).toBe(unique);

    await request(app.getHttpServer())
      .get(`/customers/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const updateResponse = await request(app.getHttpServer())
      .patch(`/customers/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: '3001234567' })
      .expect(200);
    expect((updateResponse.body as { phone: string }).phone).toBe('3001234567');

    const deactivateResponse = await request(app.getHttpServer())
      .patch(`/customers/${created.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((deactivateResponse.body as { isActive: boolean }).isActive).toBe(
      false,
    );

    const reactivateResponse = await request(app.getHttpServer())
      .patch(`/customers/${created.id}/reactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((reactivateResponse.body as { isActive: boolean }).isActive).toBe(
      true,
    );
  });

  it('anonymizes a customer, redacting its PII and deactivating it', async () => {
    const unique = `E2E-ANON-${Date.now()}`;

    const createResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: unique,
        taxId: `${unique}-NIT`,
        email: 'borrar@example.test',
        phone: '3009998877',
        address: 'Calle a borrar #1-1',
      })
      .expect(201);
    const created = createResponse.body as { id: string };
    createdIds.push(created.id);

    const anonymizeResponse = await request(app.getHttpServer())
      .patch(`/customers/${created.id}/anonymize`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const anonymized = anonymizeResponse.body as {
      name: string;
      taxId: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
      isActive: boolean;
    };
    expect(anonymized.name).toBe('Cliente eliminado');
    expect(anonymized.taxId).toBeNull();
    expect(anonymized.email).toBeNull();
    expect(anonymized.phone).toBeNull();
    expect(anonymized.address).toBeNull();
    expect(anonymized.isActive).toBe(false);

    const auditEntries = await prisma.auditLog.findMany({
      where: { entity: 'Customer', entityId: created.id, action: 'ANONYMIZE' },
    });
    expect(auditEntries).toHaveLength(1);
    // La PII borrada nunca debe quedar viviendo en el audit trail (#15).
    expect(auditEntries[0].before).toBeNull();
  });

  it('returns 404 for a customer that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/customers/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  describe('pagination, search and sort', () => {
    const unique = Date.now();

    beforeAll(async () => {
      const names = [`PagA-${unique}`, `PagB-${unique}`, `PagC-${unique}`];
      for (const name of names) {
        const response = await request(app.getHttpServer())
          .post('/customers')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name })
          .expect(201);
        createdIds.push((response.body as { id: string }).id);
      }
    });

    it('returns a paginated envelope with data and meta', async () => {
      const response = await request(app.getHttpServer())
        .get('/customers')
        .query({ pageSize: 2, page: 1 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as {
        data: unknown[];
        meta: { page: number; pageSize: number };
      };
      expect(body.data.length).toBeLessThanOrEqual(2);
      expect(body.meta).toEqual(
        expect.objectContaining({ page: 1, pageSize: 2 }),
      );
    });

    it('filters by search', async () => {
      const response = await request(app.getHttpServer())
        .get('/customers')
        .query({ search: `PagB-${unique}` })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as { data: { name: string }[] };
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe(`PagB-${unique}`);
    });

    it('rejects an invalid page number', async () => {
      await request(app.getHttpServer())
        .get('/customers')
        .query({ page: 0 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('balance', () => {
    let categoryId: string;
    let unitId: string;
    let warehouseId: string;
    let productId: string;
    let customerId: string;
    const orderIds: string[] = [];

    beforeAll(async () => {
      const unique = Date.now();
      const fixtures = await createCatalogFixtures(prisma, `bal-${unique}`);
      categoryId = fixtures.category.id;
      unitId = fixtures.unit.id;
      warehouseId = fixtures.warehouse.id;

      const product = await prisma.product.create({
        data: {
          sku: `BAL-${unique}`,
          name: 'Silla de balance',
          type: ProductType.FINISHED_GOOD,
          categoryId,
          unitId,
        },
      });
      productId = product.id;

      const customer = await prisma.customer.create({
        data: { name: `Cliente de balance ${unique}` },
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
    });

    async function createAndWarehouseOrder(
      quantity: number,
      unitPrice: number,
    ) {
      const created = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId,
          warehouseId,
          items: [{ productId, quantity, unitPrice }],
        })
        .expect(201);
      const order = created.body as { id: string; items: { id: string }[] };
      orderIds.push(order.id);

      await request(app.getHttpServer())
        .patch(`/orders/${order.id}/mark-production`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/mark-warehoused`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      return { orderId: order.id, orderItemId: order.items[0].id };
    }

    it('is zero for a customer with no remissions yet', async () => {
      const response = await request(app.getHttpServer())
        .get(`/customers/${customerId}/balance`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toEqual({
        totalBilled: '0',
        totalPaid: '0',
        balance: '0',
      });
    });

    it('derives the balance from remisiones with mixed payment statuses, filterable by customerId on /orders', async () => {
      // Pedido 1: 4 x 25 = 100, se despacha completo y se paga -> saldo 0.
      const order1 = await createAndWarehouseOrder(4, 25);
      await request(app.getHttpServer())
        .post('/remissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          orderId: order1.orderId,
          paymentStatus: 'PAGADO',
          items: [{ orderItemId: order1.orderItemId, quantity: 4 }],
        })
        .expect(201);

      // Pedido 2: 2 x 50 = 100, se despacha completo y solo se abonan 30.
      const order2 = await createAndWarehouseOrder(2, 50);
      await request(app.getHttpServer())
        .post('/remissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          orderId: order2.orderId,
          paymentStatus: 'ABONADO',
          amountPaid: 30,
          items: [{ orderItemId: order2.orderItemId, quantity: 2 }],
        })
        .expect(201);

      // Pedido 3: 3 x 10 = 30, se despacha completo y queda en cartera.
      const order3 = await createAndWarehouseOrder(3, 10);
      await request(app.getHttpServer())
        .post('/remissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          orderId: order3.orderId,
          paymentStatus: 'CARTERA',
          items: [{ orderItemId: order3.orderItemId, quantity: 3 }],
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/customers/${customerId}/balance`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Facturado: 100 + 100 + 30 = 230. Pagado: 100 + 30 = 130. Saldo: 100.
      expect(response.body).toEqual({
        totalBilled: '230',
        totalPaid: '130',
        balance: '100',
      });

      const ordersResponse = await request(app.getHttpServer())
        .get('/orders')
        .query({ customerId })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const ordersBody = ordersResponse.body as { data: { id: string }[] };
      const returnedIds = ordersBody.data.map((order) => order.id);
      expect(returnedIds).toEqual(
        expect.arrayContaining([
          order1.orderId,
          order2.orderId,
          order3.orderId,
        ]),
      );
      expect(ordersBody.data).toHaveLength(3);
    });
  });
});
