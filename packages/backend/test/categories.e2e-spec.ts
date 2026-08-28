import { INestApplication } from '@nestjs/common';
import { ProductType } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/test-app';
import { createUserAndLogin, deleteUsers } from './support/fixtures';

describe('Categories (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let staffToken: string;
  let adminUserId: string;
  let staffUserId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'categories-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;

    const staff = await createUserAndLogin(app, prisma, {
      emailPrefix: 'categories-staff',
    });
    staffUserId = staff.id;
    staffToken = staff.token;
  });

  afterAll(async () => {
    await prisma.category.deleteMany({ where: { id: { in: createdIds } } });
    await deleteUsers(prisma, [adminUserId, staffUserId]);
    await app.close();
  });

  it('rejects creation by a non-ADMIN user', async () => {
    await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Should Not Be Created' })
      .expect(403);
  });

  it('rejects creation with an invalid payload', async () => {
    await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '' })
      .expect(400);
  });

  it('creates a category, lists it, deactivates it, and reactivates it', async () => {
    const unique = `E2E-Cat-${Date.now()}`;

    const createResponse = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: unique })
      .expect(201);
    const created = createResponse.body as { id: string };
    createdIds.push(created.id);

    const listResponse = await request(app.getHttpServer())
      .get('/categories')
      .query({ search: unique })
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    const body = listResponse.body as { data: { id: string }[] };
    expect(body.data.map((category) => category.id)).toContain(created.id);

    const deactivateResponse = await request(app.getHttpServer())
      .patch(`/categories/${created.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((deactivateResponse.body as { isActive: boolean }).isActive).toBe(
      false,
    );

    const reactivateResponse = await request(app.getHttpServer())
      .patch(`/categories/${created.id}/reactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((reactivateResponse.body as { isActive: boolean }).isActive).toBe(
      true,
    );
  });

  it('rejects deactivating a category that still has active products', async () => {
    const unique = Date.now();
    const category = await prisma.category.create({
      data: { name: `E2E-Cat-InUse-${unique}` },
    });
    const unit = await prisma.unit.create({
      data: { name: `E2E-Unit-InUse-${unique}`, abbreviation: `u${unique}` },
    });
    const product = await prisma.product.create({
      data: {
        sku: `E2E-CAT-INUSE-${unique}`,
        name: 'Producto que usa la categoría',
        type: ProductType.RAW_MATERIAL,
        categoryId: category.id,
        unitId: unit.id,
      },
    });

    await request(app.getHttpServer())
      .patch(`/categories/${category.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.unit.delete({ where: { id: unit.id } });
  });

  it('returns 404 for a category that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/categories/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
