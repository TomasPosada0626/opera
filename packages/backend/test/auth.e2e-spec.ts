import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import * as argon2 from 'argon2';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { createTestApp } from './support/test-app';
import { createUserAndLogin, deleteUsers } from './support/fixtures';

// Cubre el camino de HTTP real (login, guards, RbacGuard) que los tests
// unitarios con Prisma mockeado no ejercitan: nadie había probado antes que
// un usuario sin rol ADMIN reciba 403 real al intentar una mutación.
describe('Auth + RBAC guard (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication<App>;
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
    const setResetCode = async (code: string, expiresInMs: number) => {
      const reset = {
        resetCodeHash: await argon2.hash(code),
        resetExpiresAt: new Date(Date.now() + expiresInMs),
        resetAttempts: 0,
      };
      await prisma.passwordRecovery.upsert({
        where: { userId },
        create: { userId, ...reset },
        update: reset,
      });
    };

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

    it('stores a hashed code with an expiry outside the user row, so asking for a code does not log the user out', async () => {
      // Token emitido ANTES del pedido de código. Con el código guardado
      // en User, el UPDATE movía User.updatedAt y JwtStrategy lo daba por
      // vencido (auditoría ronda 6).
      const token = await app.get(JwtService).signAsync({
        sub: userId,
        email,
        roles: [],
        permissions: [],
      });
      const userBefore = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      await new Promise((resolve) => setTimeout(resolve, 1_100));

      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email })
        .expect(200);

      const recovery = await prisma.passwordRecovery.findUniqueOrThrow({
        where: { userId },
      });
      expect(recovery.resetCodeHash).toEqual(expect.any(String));
      expect(recovery.resetExpiresAt!.getTime()).toBeGreaterThan(Date.now());
      const userAfter = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(userAfter.updatedAt).toEqual(userBefore.updatedAt);

      await request(app.getHttpServer())
        .get('/auth/recovery-code')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('rejects a reset with the wrong code', async () => {
      await setResetCode('123456', 60_000);

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ email, code: '000000', newPassword: 'Wont-be-used-123' })
        .expect(400);
    });

    it('rejects a reset with an expired code', async () => {
      await setResetCode('123456', -60_000);

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ email, code: '123456', newPassword: 'Wont-be-used-123' })
        .expect(400);
    });

    it('invalidates the code after 5 wrong attempts, even if the right one comes next', async () => {
      // Por el service directo: el endpoint tiene su propio throttle de
      // 5/min por IP, que este mismo archivo ya consume.
      await setResetCode('111111', 60_000);
      const auth = app.get(AuthService);
      for (let attempt = 0; attempt < 5; attempt++) {
        await expect(
          auth.resetPasswordWithCode(email, '999999', 'Wont-be-used-123'),
        ).rejects.toThrow('Código inválido o expirado');
      }

      const recovery = await prisma.passwordRecovery.findUniqueOrThrow({
        where: { userId },
      });
      expect(recovery.resetCodeHash).toBeNull();
      await expect(
        auth.resetPasswordWithCode(email, '111111', 'Wont-be-used-123'),
      ).rejects.toThrow('Código inválido o expirado');
    });

    it('resets the password with a valid code, and the code cannot be reused', async () => {
      await setResetCode('654321', 60_000);

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
      const recovery = await prisma.passwordRecovery.findUniqueOrThrow({
        where: { userId },
      });
      expect(recovery.resetCodeHash).toBeNull();
      expect(recovery.resetExpiresAt).toBeNull();

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

  // La salida para la app de escritorio, que no tiene correo configurado.
  describe('Código de recuperación offline', () => {
    it('only offers email recovery when SMTP is configured', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/recovery-options')
        .expect(200);
      expect(response.body).toEqual({ email: false, recoveryCode: true });
    });

    it('requires a session to issue or inspect a recovery code', async () => {
      await request(app.getHttpServer())
        .post('/auth/recovery-code')
        .expect(401);
      await request(app.getHttpServer()).get('/auth/recovery-code').expect(401);
    });

    it('issues a code once, resets the password with it, and rotates it', async () => {
      const token = await app.get(JwtService).signAsync({
        sub: userId,
        email,
        roles: [],
        permissions: [],
      });

      const issued = await request(app.getHttpServer())
        .post('/auth/recovery-code')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const code = (issued.body as { recoveryCode: string }).recoveryCode;
      expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);

      const status = await request(app.getHttpServer())
        .get('/auth/recovery-code')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(status.body).toEqual(
        expect.objectContaining({ hasRecoveryCode: true }),
      );

      await request(app.getHttpServer())
        .post('/auth/reset-password-with-recovery-code')
        .send({
          email,
          recoveryCode: 'AAAA-AAAA-AAAA-AAAA',
          newPassword: 'Wont-be-used-123',
        })
        .expect(400);

      // Escrito a mano: minúsculas y espacios en vez de guiones.
      const reset = await request(app.getHttpServer())
        .post('/auth/reset-password-with-recovery-code')
        .send({
          email,
          recoveryCode: code.toLowerCase().replace(/-/g, ' '),
          newPassword: 'Recovered-password-9',
        })
        .expect(200);
      const nextCode = (reset.body as { recoveryCode: string }).recoveryCode;
      expect(nextCode).not.toBe(code);

      const updated = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      await expect(
        argon2.verify(updated.password, 'Recovered-password-9'),
      ).resolves.toBe(true);

      // El código usado ya no sirve.
      await request(app.getHttpServer())
        .post('/auth/reset-password-with-recovery-code')
        .send({ email, recoveryCode: code, newPassword: 'Another-pass-123' })
        .expect(400);

      await prisma.user.update({
        where: { id: userId },
        data: { password: await argon2.hash(password) },
      });
    });
  });
});
