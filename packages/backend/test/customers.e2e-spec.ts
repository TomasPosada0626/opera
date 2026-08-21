import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/test-app';
import { createUserAndLogin, deleteUsers } from './support/fixtures';

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

  it('creates, reads, updates and deactivates a customer', async () => {
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
});
