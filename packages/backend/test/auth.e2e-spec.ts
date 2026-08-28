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
    // deleteUsers (no prisma.user.delete directo): el describe de abajo
    // sobre recuperación de contraseña deja una fila real de AuditLog
    // (action PASSWORD_RESET_SELF_SERVICE) referenciando este usuario, y
    // AuditLog nunca se borra por FK — deleteUsers ya limpia eso primero.
    await deleteUsers(prisma, [userId]);
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

  // SMTP nunca está configurado en CI/local e2e (ver MailService) — el
  // envío real no se puede ejercitar acá, MailService.sendPasswordResetCode
  // ya lo cubre en su propio unit test. Lo que sí se prueba de punta a
  // punta contra Postgres real es la parte que sí importa que sea correcta:
  // el código HTTP real de /auth/forgot-password (nunca revela si el email
  // existe) y de /auth/reset-password (valida hash+expiración, actualiza la
  // contraseña, la nueva sirve para loguear).
  describe('Recuperación de contraseña por correo', () => {
    it('returns the same generic message for an existing and a non-existing email', async () => {
      const existing = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email })
        .expect(200);
      const missing = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'nobody-forgot@opera.local' })
        .expect(200);

      expect(existing.body).toEqual(missing.body);
    });

    it('sets a hashed code with an expiry on the user row when the email exists', async () => {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email })
        .expect(200);

      const updated = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(updated.passwordResetCodeHash).toEqual(expect.any(String));
      expect(updated.passwordResetExpiresAt).not.toBeNull();
      expect(updated.passwordResetExpiresAt!.getTime()).toBeGreaterThan(
        Date.now(),
      );
    });

    it('rejects a reset with the wrong code', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordResetCodeHash: await argon2.hash('123456'),
          passwordResetExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ email, code: '000000', newPassword: 'Wont-be-used-123' })
        .expect(400);
    });

    it('rejects a reset with an expired code', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordResetCodeHash: await argon2.hash('123456'),
          passwordResetExpiresAt: new Date(Date.now() - 60_000),
        },
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ email, code: '123456', newPassword: 'Wont-be-used-123' })
        .expect(400);
    });

    it('resets the password with a valid code, and the code cannot be reused', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordResetCodeHash: await argon2.hash('654321'),
          passwordResetExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ email, code: '654321', newPassword: 'Brand-new-password-1' })
        .expect(200);

      // Verifica directo contra la base (no vía /auth/login, que comparte
      // el mismo throttle de 5/min por IP que ya consumen los tests de
      // arriba de este mismo archivo) que la contraseña realmente cambió y
      // que el código quedó limpio.
      const updated = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      await expect(
        argon2.verify(updated.password, 'Brand-new-password-1'),
      ).resolves.toBe(true);
      expect(updated.passwordResetCodeHash).toBeNull();
      expect(updated.passwordResetExpiresAt).toBeNull();

      // El código ya se usó -- reintentarlo (aunque siga "vigente" en
      // teoría, si alguien no hubiera limpiado los campos) debe rechazarse.
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ email, code: '654321', newPassword: 'Another-password-2' })
        .expect(400);

      // Restaura la contraseña original -- buena higiene aunque este sea
      // el último describe del archivo, por si algo se agrega después.
      await prisma.user.update({
        where: { id: userId },
        data: { password: await argon2.hash(password) },
      });
    });
  });
});
