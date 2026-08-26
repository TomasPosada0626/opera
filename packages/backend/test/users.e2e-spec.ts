import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/test-app';
import { createUserAndLogin, deleteUsers } from './support/fixtures';

// Sin cobertura e2e previa (encontrada al construir #96) — hasta ahora solo
// tenía unit tests con Prisma mockeado, nunca se probó sobre HTTP/Postgres
// real ni el guard RBAC de @Roles('ADMIN') que protege todo el controller.
describe('Users (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminUserId: string;
  let staffToken: string;
  let staffUserId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'users-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;

    const staff = await createUserAndLogin(app, prisma, {
      emailPrefix: 'users-staff',
    });
    staffUserId = staff.id;
    staffToken = staff.token;
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { userId: { in: createdIds } } });
    await deleteUsers(prisma, [...createdIds, adminUserId, staffUserId]);
    await app.close();
  });

  it('rejects every route for a user without the ADMIN role', async () => {
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/users').expect(401);
  });

  it('creates, lists, reads and updates a user as ADMIN', async () => {
    const unique = Date.now();
    const created = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `users-e2e-${unique}@opera.local`,
        password: 'Test-password-123!',
        name: 'Usuario de prueba',
      })
      .expect(201);
    const user = created.body as { id: string };
    createdIds.push(user.id);
    expect(created.body).not.toHaveProperty('password');

    const list = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((list.body as { id: string }[]).some((u) => u.id === user.id)).toBe(
      true,
    );

    const found = await request(app.getHttpServer())
      .get(`/users/${user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((found.body as { name: string }).name).toBe('Usuario de prueba');

    const updated = await request(app.getHttpServer())
      .patch(`/users/${user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Usuario actualizado' })
      .expect(200);
    expect((updated.body as { name: string }).name).toBe('Usuario actualizado');
  });

  it('resets a user password without ever returning it', async () => {
    const unique = Date.now();
    const created = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `users-reset-${unique}@opera.local`,
        password: 'Test-password-123!',
        name: 'Usuario a resetear',
      })
      .expect(201);
    const user = created.body as { id: string };
    createdIds.push(user.id);

    const response = await request(app.getHttpServer())
      .patch(`/users/${user.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'Brand-new-password-123!' })
      .expect(200);
    expect(response.body).not.toHaveProperty('password');
  });

  it('deactivates a user', async () => {
    const unique = Date.now();
    const created = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `users-deactivate-${unique}@opera.local`,
        password: 'Test-password-123!',
        name: 'Usuario a desactivar',
      })
      .expect(201);
    const user = created.body as { id: string };
    createdIds.push(user.id);

    const response = await request(app.getHttpServer())
      .patch(`/users/${user.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((response.body as { isActive: boolean }).isActive).toBe(false);
  });

  it('refuses to let an admin deactivate their own account', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/users/${adminUserId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    expect((response.body as { message: string }).message).toContain(
      'propia cuenta',
    );
  });
});
