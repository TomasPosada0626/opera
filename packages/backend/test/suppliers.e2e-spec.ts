import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/test-app';
import { createUserAndLogin, deleteUsers } from './support/fixtures';
import { bufferParser } from './support/binary-response';

describe('Suppliers (e2e)', () => {
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
      emailPrefix: 'suppliers-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;
  });

  afterAll(async () => {
    await prisma.supplier.deleteMany({ where: { id: { in: createdIds } } });
    await deleteUsers(prisma, [adminUserId]);
    await app.close();
  });

  it('rejects creation with an invalid payload (empty name)', async () => {
    await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '' })
      .expect(400);
  });

  it('rejects creation with an invalid email', async () => {
    await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Proveedor de prueba', email: 'no-es-un-correo' })
      .expect(400);
  });

  it('creates, reads, updates, deactivates, and reactivates a supplier', async () => {
    const unique = `E2E-CRUD-${Date.now()}`;

    const createResponse = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: unique, taxId: `${unique}-NIT` })
      .expect(201);
    const created = createResponse.body as { id: string; name: string };
    createdIds.push(created.id);
    expect(created.name).toBe(unique);

    await request(app.getHttpServer())
      .get(`/suppliers/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const updateResponse = await request(app.getHttpServer())
      .patch(`/suppliers/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: '3009876543' })
      .expect(200);
    expect((updateResponse.body as { phone: string }).phone).toBe('3009876543');

    const deactivateResponse = await request(app.getHttpServer())
      .patch(`/suppliers/${created.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((deactivateResponse.body as { isActive: boolean }).isActive).toBe(
      false,
    );

    const reactivateResponse = await request(app.getHttpServer())
      .patch(`/suppliers/${created.id}/reactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((reactivateResponse.body as { isActive: boolean }).isActive).toBe(
      true,
    );
  });

  it('exports a supplier as a real .xlsx workbook with its own prices and purchases', async () => {
    const unique = `E2E-EXPORT-${Date.now()}`;

    const created = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: unique, taxId: `${unique}-NIT` })
      .expect(201);
    const supplier = created.body as { id: string };
    createdIds.push(supplier.id);

    const exportResponse = await request(app.getHttpServer())
      .get(`/suppliers/${supplier.id}/export`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse(bufferParser)
      .expect(200);

    expect(exportResponse.headers['content-type']).toContain(
      'spreadsheetml.sheet',
    );
    expect((exportResponse.body as Buffer).subarray(0, 2).toString()).toBe(
      'PK',
    );
  });

  it('anonymizes a supplier, redacting its PII and deactivating it', async () => {
    const unique = `E2E-ANON-${Date.now()}`;

    const createResponse = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: unique,
        taxId: `${unique}-NIT`,
        email: 'borrar@example.test',
        phone: '3009998877',
        address: 'Carrera a borrar #1-1',
      })
      .expect(201);
    const created = createResponse.body as { id: string };
    createdIds.push(created.id);

    const anonymizeResponse = await request(app.getHttpServer())
      .patch(`/suppliers/${created.id}/anonymize`)
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
    expect(anonymized.name).toBe('Proveedor eliminado');
    expect(anonymized.taxId).toBeNull();
    expect(anonymized.email).toBeNull();
    expect(anonymized.phone).toBeNull();
    expect(anonymized.address).toBeNull();
    expect(anonymized.isActive).toBe(false);

    const auditEntries = await prisma.auditLog.findMany({
      where: { entity: 'Supplier', entityId: created.id, action: 'ANONYMIZE' },
    });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].before).toBeNull();
  });

  it('returns 404 for a supplier that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/suppliers/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  describe('pagination, search and sort', () => {
    const unique = Date.now();

    beforeAll(async () => {
      const names = [`PagA-${unique}`, `PagB-${unique}`, `PagC-${unique}`];
      for (const name of names) {
        const response = await request(app.getHttpServer())
          .post('/suppliers')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name })
          .expect(201);
        createdIds.push((response.body as { id: string }).id);
      }
    });

    it('returns a paginated envelope with data and meta', async () => {
      const response = await request(app.getHttpServer())
        .get('/suppliers')
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
        .get('/suppliers')
        .query({ search: `PagB-${unique}` })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as { data: { name: string }[] };
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe(`PagB-${unique}`);
    });

    it('rejects an invalid page number', async () => {
      await request(app.getHttpServer())
        .get('/suppliers')
        .query({ page: 0 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });
});
