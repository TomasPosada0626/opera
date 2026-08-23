import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/test-app';
import { createUserAndLogin, deleteUsers } from './support/fixtures';

describe('Products (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let staffToken: string;
  let adminUserId: string;
  let staffUserId: string;
  let categoryId: string;
  let unitId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'products-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;

    const staff = await createUserAndLogin(app, prisma, {
      emailPrefix: 'products-staff',
    });
    staffUserId = staff.id;
    staffToken = staff.token;

    const unique = Date.now();
    const category = await prisma.category.create({
      data: { name: `ProdE2ECat-${unique}` },
    });
    const unit = await prisma.unit.create({
      data: { name: `ProdE2EUnit-${unique}`, abbreviation: `pu${unique}` },
    });
    categoryId = category.id;
    unitId = unit.id;
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.unit.delete({ where: { id: unitId } });
    await deleteUsers(prisma, [adminUserId, staffUserId]);
    await app.close();
  });

  it('rejects creation by a non-ADMIN user', async () => {
    await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        sku: 'SHOULD-NOT-EXIST',
        name: 'No debería crearse',
        type: 'FINISHED_GOOD',
        categoryId,
        unitId,
      })
      .expect(403);
  });

  it('rejects creation with an invalid payload (missing categoryId)', async () => {
    await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'BAD-001',
        name: 'Producto inválido',
        type: 'FINISHED_GOOD',
      })
      .expect(400);
  });

  it('creates a product and finds it by SKU or by name search', async () => {
    const unique = Date.now();
    const sku = `E2E-SKU-${unique}`;

    const createResponse = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku,
        name: `Producto E2E ${unique}`,
        type: 'FINISHED_GOOD',
        categoryId,
        unitId,
      })
      .expect(201);
    const created = createResponse.body as { id: string };
    createdIds.push(created.id);

    const bySkuResponse = await request(app.getHttpServer())
      .get('/products')
      .query({ search: sku })
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    const bySku = bySkuResponse.body as { data: { id: string }[] };
    expect(bySku.data.map((product) => product.id)).toContain(created.id);

    const byNameResponse = await request(app.getHttpServer())
      .get('/products')
      .query({ search: `Producto E2E ${unique}` })
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    const byName = byNameResponse.body as { data: { id: string }[] };
    expect(byName.data.map((product) => product.id)).toContain(created.id);
  });

  it('creates a product with descriptive attributes and finds it by searching them', async () => {
    const unique = Date.now();

    const createResponse = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: `E2E-ATTR-${unique}`,
        name: `Silla E2E ${unique}`,
        type: 'FINISHED_GOOD',
        categoryId,
        unitId,
        finish: `Roble natural ${unique}`,
        material: `Madera maciza ${unique}`,
        size: `Grande ${unique}`,
      })
      .expect(201);
    const created = createResponse.body as {
      id: string;
      finish: string;
      material: string;
      size: string;
    };
    createdIds.push(created.id);
    expect(created.finish).toBe(`Roble natural ${unique}`);
    expect(created.material).toBe(`Madera maciza ${unique}`);
    expect(created.size).toBe(`Grande ${unique}`);

    const byFinishResponse = await request(app.getHttpServer())
      .get('/products')
      .query({ search: `Roble natural ${unique}` })
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    const byFinish = byFinishResponse.body as { data: { id: string }[] };
    expect(byFinish.data.map((product) => product.id)).toContain(created.id);
  });

  it('returns 404 for a product that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/products/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
