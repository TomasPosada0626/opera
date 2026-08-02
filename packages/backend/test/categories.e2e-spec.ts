import { INestApplication } from '@nestjs/common';
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

  it('creates a category, lists it, and deactivates it', async () => {
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
  });

  it('returns 404 for a category that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/categories/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
