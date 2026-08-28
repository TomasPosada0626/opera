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

describe('Supplier products (e2e)', () => {
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
      emailPrefix: 'supplier-products-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;

    const unique = Date.now();
    const fixtures = await createCatalogFixtures(prisma, `sp-${unique}`);
    categoryId = fixtures.category.id;
    unitId = fixtures.unit.id;
    warehouseId = fixtures.warehouse.id;

    const supplier = await prisma.supplier.create({
      data: { name: `Proveedor de prueba ${unique}` },
    });
    supplierId = supplier.id;

    const product = await prisma.product.create({
      data: {
        sku: `SP-${unique}`,
        name: 'Tabla de pino',
        type: ProductType.RAW_MATERIAL,
        categoryId,
        unitId,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.supplierProduct.deleteMany({
      where: { id: { in: createdIds } },
    });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.supplier.delete({ where: { id: supplierId } });
    await deleteCatalogFixtures(prisma, { categoryId, unitId, warehouseId });
    await deleteUsers(prisma, [adminUserId]);
    await app.close();
  });

  it('rejects creation for a supplier that does not exist', async () => {
    await request(app.getHttpServer())
      .post('/supplier-products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        productId,
        price: 15000,
      })
      .expect(404);
  });

  it('rejects creation for a deactivated supplier', async () => {
    const deactivated = await prisma.supplier.create({
      data: { name: `Proveedor desactivado ${Date.now()}`, isActive: false },
    });

    await request(app.getHttpServer())
      .post('/supplier-products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ supplierId: deactivated.id, productId, price: 15000 })
      .expect(400);

    await prisma.supplier.delete({ where: { id: deactivated.id } });
  });

  it('creates a price, then overwrites it on the same supplier/product pair', async () => {
    const created = await request(app.getHttpServer())
      .post('/supplier-products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ supplierId, productId, price: 15000 })
      .expect(201);
    const createdBody = created.body as { id: string; price: string };
    createdIds.push(createdBody.id);
    expect(createdBody.price).toBe('15000');

    const overwritten = await request(app.getHttpServer())
      .post('/supplier-products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ supplierId, productId, price: 18000 })
      .expect(201);
    const overwrittenBody = overwritten.body as { id: string; price: string };
    // Mismo par proveedor/producto -> misma fila, no una segunda.
    expect(overwrittenBody.id).toBe(createdBody.id);
    expect(overwrittenBody.price).toBe('18000');

    const list = await request(app.getHttpServer())
      .get('/supplier-products')
      .query({ supplierId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const listBody = list.body as { data: { id: string; price: string }[] };
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].price).toBe('18000');
  });

  it('rejects deletion by a non-ADMIN user, then deletes it and it disappears from the list', async () => {
    const created = await request(app.getHttpServer())
      .post('/supplier-products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ supplierId, productId, price: 20000 })
      .expect(201);
    const createdId = (created.body as { id: string }).id;

    const staff = await createUserAndLogin(app, prisma, {
      emailPrefix: 'supplier-products-staff',
    });

    await request(app.getHttpServer())
      .delete(`/supplier-products/${createdId}`)
      .set('Authorization', `Bearer ${staff.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/supplier-products/${createdId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    const list = await request(app.getHttpServer())
      .get('/supplier-products')
      .query({ supplierId, productId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((list.body as { data: unknown[] }).data).toHaveLength(0);

    await deleteUsers(prisma, [staff.id]);
  });

  it('returns 404 when deleting a supplier-product price that does not exist', async () => {
    await request(app.getHttpServer())
      .delete('/supplier-products/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
