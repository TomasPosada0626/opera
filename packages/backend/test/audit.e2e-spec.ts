import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/test-app';
import { createUserAndLogin, deleteUsers } from './support/fixtures';

describe('Audit (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let staffToken: string;
  let adminUserId: string;
  let staffUserId: string;
  let categoryId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'audit-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;

    const staff = await createUserAndLogin(app, prisma, {
      emailPrefix: 'audit-staff',
    });
    staffUserId = staff.id;
    staffToken = staff.token;

    // Creada por la API real (no Prisma directo) para que de verdad escriba
    // un AuditLog atribuido a adminUserId — es justo lo que este test
    // consulta.
    const created = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Audit-E2E-${Date.now()}` })
      .expect(201);
    categoryId = (created.body as { id: string }).id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: categoryId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await deleteUsers(prisma, [adminUserId, staffUserId]);
    await app.close();
  });

  it('rejects a non-ADMIN user', async () => {
    await request(app.getHttpServer())
      .get('/audit')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/audit').expect(401);
  });

  it('filters by entity and entityId, returning before/after for the real CREATE it wrote', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit')
      .query({ entity: 'Category', entityId: categoryId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = response.body as {
      data: {
        entity: string;
        entityId: string;
        action: string;
        after: { id: string } | null;
        user: { id: string };
      }[];
      meta: { total: number };
    };

    expect(body.meta.total).toBeGreaterThanOrEqual(1);
    const createEntry = body.data.find((entry) => entry.action === 'CREATE');
    expect(createEntry).toEqual(
      expect.objectContaining({
        entity: 'Category',
        entityId: categoryId,
      }),
    );
    expect(createEntry?.user.id).toBe(adminUserId);
    expect(createEntry?.after).toEqual(
      expect.objectContaining({ id: categoryId }),
    );
  });

  it('excludes entries outside the given date range', async () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const response = await request(app.getHttpServer())
      .get('/audit')
      .query({
        entity: 'Category',
        entityId: categoryId,
        from: farFuture.toISOString(),
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = response.body as { data: unknown[] };
    expect(body.data).toEqual([]);
  });
});
