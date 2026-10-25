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

// Auditoría ronda 6: lista de materiales editable por HTTP, consumo
// automático de materia prima al pasar un pedido a almacén, y los datos de
// seguimiento del pedido (fecha de envío estimada, notas, atrasados) —
// contra Postgres real, no Prisma mockeado.
describe('Order tracking and bill of materials (e2e)', () => {
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
  let chairId: string;
  let woodId: string;
  let screwId: string;
  const orderIds: string[] = [];

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'tracking-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;
    const staff = await createUserAndLogin(app, prisma, {
      emailPrefix: 'tracking-staff',
    });
    staffUserId = staff.id;
    staffToken = staff.token;

    const unique = Date.now();
    const fixtures = await createCatalogFixtures(prisma, `tracking-${unique}`);
    categoryId = fixtures.category.id;
    unitId = fixtures.unit.id;
    warehouseId = fixtures.warehouse.id;

    const product = (sku: string, name: string, type: ProductType) =>
      prisma.product.create({
        data: { sku: `${sku}-${unique}`, name, type, categoryId, unitId },
      });
    chairId = (await product('TRK-CHAIR', 'Silla', ProductType.FINISHED_GOOD))
      .id;
    woodId = (await product('TRK-WOOD', 'Tabla', ProductType.RAW_MATERIAL)).id;
    screwId = (await product('TRK-SCREW', 'Tornillo', ProductType.SUPPLY)).id;

    const customer = await prisma.customer.create({
      data: { name: `Cliente seguimiento ${unique}` },
    });
    customerId = customer.id;

    // 10 tablas a 4 y 100 tornillos a 0.5, con costo real.
    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set(auth())
      .send({ productId: woodId, warehouseId, quantity: 10, unitCost: 4 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set(auth())
      .send({ productId: screwId, warehouseId, quantity: 100, unitCost: 0.5 })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.remission.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.billOfMaterials.deleteMany({ where: { productId: chairId } });
    await prisma.stockMovement.deleteMany({
      where: { productId: { in: [chairId, woodId, screwId] } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: [chairId, woodId, screwId] } },
    });
    await prisma.customer.delete({ where: { id: customerId } });
    await deleteCatalogFixtures(prisma, { categoryId, unitId, warehouseId });
    await deleteUsers(prisma, [adminUserId, staffUserId]);
    await app.close();
  });

  async function createOrder(body: Record<string, unknown>) {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set(auth())
      .send({
        customerId,
        warehouseId,
        items: [{ productId: chairId, quantity: 2, unitPrice: 90 }],
        ...body,
      })
      .expect(201);
    const order = response.body as {
      id: string;
      number: number;
      estimatedDeliveryDate: string | null;
      notes: string | null;
      items: { id: string }[];
    };
    orderIds.push(order.id);
    return order;
  }

  describe('bill of materials', () => {
    it('starts empty for a product without a list', async () => {
      const response = await request(app.getHttpServer())
        .get(`/products/${chairId}/bill-of-materials`)
        .set(auth())
        .expect(200);
      expect((response.body as { items: unknown[] }).items).toEqual([]);
    });

    it('rejects writes from a non-ADMIN user', async () => {
      await request(app.getHttpServer())
        .put(`/products/${chairId}/bill-of-materials`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ items: [{ componentId: woodId, quantity: 3 }] })
        .expect(403);
    });

    it('rejects a list on a raw material and a finished good used as material', async () => {
      await request(app.getHttpServer())
        .put(`/products/${woodId}/bill-of-materials`)
        .set(auth())
        .send({ items: [{ componentId: screwId, quantity: 1 }] })
        .expect(400);
      await request(app.getHttpServer())
        .put(`/products/${chairId}/bill-of-materials`)
        .set(auth())
        .send({ items: [{ componentId: chairId, quantity: 1 }] })
        .expect(400);
    });

    it('saves the full list and returns it with each component', async () => {
      const response = await request(app.getHttpServer())
        .put(`/products/${chairId}/bill-of-materials`)
        .set(auth())
        .send({
          items: [
            { componentId: woodId, quantity: 3 },
            { componentId: screwId, quantity: 8 },
          ],
        })
        .expect(200);
      const body = response.body as {
        items: {
          componentId: string;
          quantity: string;
          component: { name: string };
        }[];
      };
      expect(
        body.items.map((item) => [item.component.name, Number(item.quantity)]),
      ).toEqual([
        ['Tabla', 3],
        ['Tornillo', 8],
      ]);
    });
  });

  describe('order tracking', () => {
    it('rejects a delivery date with a time component', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .set(auth())
        .send({
          customerId,
          warehouseId,
          items: [{ productId: chairId, quantity: 1, unitPrice: 90 }],
          estimatedDeliveryDate: '2026-11-15T10:00:00Z',
        })
        .expect(400);
    });

    it('stores the estimated date and notes, gives the order a readable number, and lets the admin edit them', async () => {
      const order = await createOrder({
        estimatedDeliveryDate: '2030-01-15',
        notes: 'Color nogal',
      });
      expect(order.number).toBeGreaterThan(0);
      expect(order.estimatedDeliveryDate?.slice(0, 10)).toBe('2030-01-15');
      expect(order.notes).toBe('Color nogal');

      await request(app.getHttpServer())
        .patch(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ notes: 'x' })
        .expect(403);

      const updated = await request(app.getHttpServer())
        .patch(`/orders/${order.id}`)
        .set(auth())
        .send({ estimatedDeliveryDate: '2030-02-01', notes: null })
        .expect(200);
      const body = updated.body as {
        estimatedDeliveryDate: string;
        notes: string | null;
      };
      expect(body.estimatedDeliveryDate.slice(0, 10)).toBe('2030-02-01');
      expect(body.notes).toBeNull();

      const byNumber = await request(app.getHttpServer())
        .get('/orders')
        .query({ search: String(order.number) })
        .set(auth())
        .expect(200);
      expect(
        (byNumber.body as { data: { id: string }[] }).data.map((o) => o.id),
      ).toEqual([order.id]);
    });

    it('lists an order whose promised date passed as overdue, until it is cancelled', async () => {
      const late = await createOrder({ estimatedDeliveryDate: '2020-01-01' });
      const onTime = await createOrder({ estimatedDeliveryDate: '2099-01-01' });

      const overdue = await request(app.getHttpServer())
        .get('/orders')
        .query({ overdue: 'true', customerId, pageSize: 100 })
        .set(auth())
        .expect(200);
      const ids = (overdue.body as { data: { id: string }[] }).data.map(
        (order) => order.id,
      );
      expect(ids).toContain(late.id);
      expect(ids).not.toContain(onTime.id);

      const cancelled = await request(app.getHttpServer())
        .patch(`/orders/${late.id}/cancel`)
        .set(auth())
        .expect(200);
      expect(
        (cancelled.body as { cancelledAt: string | null }).cancelledAt,
      ).not.toBeNull();

      const after = await request(app.getHttpServer())
        .get('/orders')
        .query({ overdue: 'true', customerId, pageSize: 100 })
        .set(auth())
        .expect(200);
      expect(
        (after.body as { data: { id: string }[] }).data.map((o) => o.id),
      ).not.toContain(late.id);
    });
  });

  describe('automatic material consumption', () => {
    it('consumes the raw materials and enters the chair at its real cost when the order reaches the warehouse', async () => {
      const order = await createOrder({});
      await request(app.getHttpServer())
        .patch(`/orders/${order.id}/mark-production`)
        .set(auth())
        .expect(200);
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/mark-warehoused`)
        .set(auth())
        .expect(201);

      const stock = async (productId: string) =>
        Number(
          (
            (
              await request(app.getHttpServer())
                .get(`/inventory/${productId}/stock`)
                .set(auth())
                .expect(200)
            ).body as { stock: string }
          ).stock,
        );
      // 2 sillas x 3 tablas, 2 x 8 tornillos.
      expect(await stock(woodId)).toBe(4);
      expect(await stock(screwId)).toBe(84);
      expect(await stock(chairId)).toBe(2);

      // Costo por silla: 3 x 4 + 8 x 0.5 = 16.
      const entry = await prisma.stockMovement.findFirst({
        where: { productId: chairId, type: 'ENTRADA' },
        orderBy: { createdAt: 'desc' },
      });
      expect(Number(entry?.unitCost)).toBe(16);
      expect(entry?.reason).toBe(
        `Producción terminada, pedido No. ${order.number}`,
      );
    });

    it('refuses to move the order to the warehouse when a material is short, without touching stock', async () => {
      // 5 sillas necesitan 15 tablas; quedan 4.
      const order = await createOrder({
        items: [{ productId: chairId, quantity: 5, unitPrice: 90 }],
      });
      await request(app.getHttpServer())
        .patch(`/orders/${order.id}/mark-production`)
        .set(auth())
        .expect(200);

      const response = await request(app.getHttpServer())
        .post(`/orders/${order.id}/mark-warehoused`)
        .set(auth())
        .expect(400);
      const body = response.body as {
        shortages: {
          componentName: string;
          required: string;
          available: string;
        }[];
      };
      expect(body.shortages).toEqual([
        expect.objectContaining({
          componentName: 'Tabla',
          required: '15',
          available: '4',
        }),
      ]);

      const current = await request(app.getHttpServer())
        .get(`/orders/${order.id}`)
        .set(auth())
        .expect(200);
      expect((current.body as { status: string }).status).toBe('EN_PRODUCCION');
    });

    it('stops consuming once the list is removed', async () => {
      await request(app.getHttpServer())
        .delete(`/products/${chairId}/bill-of-materials`)
        .set(auth())
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/products/${chairId}/bill-of-materials`)
        .set(auth())
        .expect(404);

      const order = await createOrder({
        items: [{ productId: chairId, quantity: 5, unitPrice: 90 }],
      });
      await request(app.getHttpServer())
        .patch(`/orders/${order.id}/mark-production`)
        .set(auth())
        .expect(200);
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/mark-warehoused`)
        .set(auth())
        .expect(201);
    });
  });

  describe('reports and dashboard', () => {
    it('exposes the receivables report and the new dashboard blocks', async () => {
      const cartera = await request(app.getHttpServer())
        .get('/reports/cartera')
        .set(auth())
        .expect(200);
      expect(Array.isArray(cartera.body)).toBe(true);

      const excel = await request(app.getHttpServer())
        .get('/reports/cartera/excel')
        .set(auth())
        .expect(200);
      expect(excel.headers['content-type']).toContain('spreadsheetml');

      const dashboard = await request(app.getHttpServer())
        .get('/dashboard/resumen')
        .set(auth())
        .expect(200);
      const body = dashboard.body as {
        orders: Record<string, number>;
        overdueOrders: { count: number };
        receivables: { total: string };
      };
      expect(body.orders).toHaveProperty('DESPACHADO');
      expect(typeof body.overdueOrders.count).toBe('number');
      expect(body.receivables).toHaveProperty('total');
    });
  });
});
