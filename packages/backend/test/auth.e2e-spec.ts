import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/test-app';
import { createUserAndLogin, deleteUsers } from './support/fixtures';

// Cubre el camino de HTTP real (login, guards, RbacGuard) que los tests
// unitarios con Prisma mockeado no ejercitan: nadie había probado antes que
// un usuario sin rol ADMIN reciba 403 real al intentar una mutación.
describe('Auth + RBAC guard (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;

  const email = `auth-e2e-${Date.now()}@opera.local`;
  const password = 'Test-password-123!';
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const user = await prisma.user.create({
      data: { email, password: await argon2.hash(password), name: 'Auth E2E' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('logs in with valid credentials and returns a JWT', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    expect(typeof (response.body as { accessToken: string }).accessToken).toBe(
      'string',
    );
  });

  it('rejects login with the wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects login for an email that does not exist', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@opera.local', password })
      .expect(401);
  });

  it('rejects a request to a protected route with no token', async () => {
    await request(app.getHttpServer()).get('/warehouses').expect(401);
  });

  it('rejects a request with a malformed bearer token', async () => {
    await request(app.getHttpServer())
      .get('/warehouses')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  describe('RbacGuard on an ADMIN-only mutation', () => {
    let staffUserId: string;
    let staffToken: string;
    let adminUserId: string;
    let adminToken: string;

    beforeAll(async () => {
      const staff = await createUserAndLogin(app, prisma, {
        emailPrefix: 'rbac-staff',
      });
      staffUserId = staff.id;
      staffToken = staff.token;

      const admin = await createUserAndLogin(app, prisma, {
        emailPrefix: 'rbac-admin',
        roleName: 'ADMIN',
      });
      adminUserId = admin.id;
      adminToken = admin.token;
    });

    afterAll(async () => {
      await deleteUsers(prisma, [staffUserId, adminUserId]);
    });

    it('returns 403 when an authenticated user without the ADMIN role posts a warehouse', async () => {
      await request(app.getHttpServer())
        .post('/warehouses')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Should Not Be Created' })
        .expect(403);
    });

    it('returns 201 when an ADMIN posts a warehouse, and cleans it up', async () => {
      const response = await request(app.getHttpServer())
        .post('/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `RBAC-Allowed-${Date.now()}` })
        .expect(201);

      const created = response.body as { id: string };
      await prisma.warehouse.delete({ where: { id: created.id } });
    });

    it('still allows a non-ADMIN user to read the (unrestricted) warehouse list', async () => {
      await request(app.getHttpServer())
        .get('/warehouses')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
    });
  });
});
