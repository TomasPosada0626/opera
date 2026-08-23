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

describe('Supplier purchases (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminUserId: string;
  let categoryId: string;
  let unitId: string;
  let warehouseId: string;
  let supplierId: string;
  let productId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'supplier-purchases-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;

    const unique = Date.now();
    const fixtures = await createCatalogFixtures(prisma, `spu-${unique}`);
    categoryId = fixtures.category.id;
    unitId = fixtures.unit.id;
    warehouseId = fixtures.warehouse.id;

    const supplier = await prisma.supplier.create({
      data: { name: `Proveedor de prueba ${unique}` },
    });
    supplierId = supplier.id;

    const product = await prisma.product.create({
      data: {
        sku: `SPU-${unique}`,
        name: 'Tabla de pino',
        type: ProductType.RAW_MATERIAL,
        categoryId,
        unitId,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.supplierPurchase.deleteMany({
      where: { id: { in: createdIds } },
    });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.supplier.delete({ where: { id: supplierId } });
    await deleteCatalogFixtures(prisma, { categoryId, unitId, warehouseId });
    await deleteUsers(prisma, [adminUserId]);
    await app.close();
  });

  it('rejects creation for a product that does not exist', async () => {
    await request(app.getHttpServer())
      .post('/supplier-purchases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        productId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        quantity: 10,
        unitCost: 5000,
      })
      .expect(404);
  });

  it('registers a purchase without moving stock, and lists it filtered by date range', async () => {
    const created = await request(app.getHttpServer())
      .post('/supplier-purchases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        productId,
        quantity: 20,
        unitCost: 4500,
        purchasedAt: '2026-01-15T00:00:00.000Z',
      })
      .expect(201);
    const createdBody = created.body as {
      id: string;
      quantity: string;
      unitCost: string;
      user: { name: string };
    };
    createdIds.push(createdBody.id);
    expect(createdBody.quantity).toBe('20');
    expect(createdBody.unitCost).toBe('4500');
    expect(createdBody.user).toBeDefined();

    // La bitácora es manual — registrar la compra no debe tocar Kardex.
    const stock = await request(app.getHttpServer())
      .get(`/inventory/${productId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((stock.body as { stock: string }).stock).toBe('0');

    const inRange = await request(app.getHttpServer())
      .get('/supplier-purchases')
      .query({
        supplierId,
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-02-01T00:00:00.000Z',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const inRangeBody = inRange.body as { data: { id: string }[] };
    expect(inRangeBody.data.map((p) => p.id)).toContain(createdBody.id);

    const outOfRange = await request(app.getHttpServer())
      .get('/supplier-purchases')
      .query({
        supplierId,
        from: '2026-03-01T00:00:00.000Z',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const outOfRangeBody = outOfRange.body as { data: { id: string }[] };
    expect(outOfRangeBody.data.map((p) => p.id)).not.toContain(createdBody.id);
  });
});
