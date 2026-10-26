import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as argon2 from 'argon2';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/test-app';
import { deleteUsers } from './support/fixtures';

// La app de escritorio no tiene correo: las cuentas reales de Herrajes Toro
// entran con un nombre de usuario ("herrajestoro"), sin importar mayúsculas.
// Spec propio (con su propia app) a propósito: /auth/login tiene un límite
// de intentos por IP, y sumar estos logins al spec de auth dejaba sin cupo
// a los tests que vienen después en ese archivo.
describe('Login con nombre de usuario (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication<App>;
  let prisma: PrismaService;
  const password = 'Test-password-123!';
  const username = `toro${Date.now()}`;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const user = await prisma.user.create({
      data: {
        email: username,
        password: await argon2.hash(password),
        name: 'Usuario sin correo',
      },
    });
    createdUserIds.push(user.id);
    // ADMIN antes del login: el token lleva los roles del momento en que se
    // emite.
    const adminRole = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN' },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: adminRole.id },
    });
  });

  afterAll(async () => {
    await deleteUsers(prisma, createdUserIds);
    await app.close();
  });

  it('logs in with a username instead of an email, ignoring case and spaces', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `  ${username.toUpperCase()} `, password })
      .expect(200);

    expect(typeof (response.body as { accessToken: string }).accessToken).toBe(
      'string',
    );
  });

  it('rejects an identifier that is neither an email nor a valid username', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'con espacio', password })
      .expect(400);
  });

  it('lets an admin create another account with a username, stored in lowercase', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: username, password })
      .expect(200);
    const token = (login.body as { accessToken: string }).accessToken;

    const backupName = `${username}-respaldo`;
    const created = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: backupName.toUpperCase(),
        password,
        name: 'Cuenta de respaldo',
      })
      .expect(201);
    const createdUser = created.body as { id: string; email: string };
    createdUserIds.push(createdUser.id);

    expect(createdUser.email).toBe(backupName);
  });
});
