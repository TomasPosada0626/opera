import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/test-app';
import { deleteUsers } from './support/fixtures';

describe('Setup (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  const createdIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    // Este endpoint solo tiene sentido con la tabla User realmente vacía
    // (primer arranque de una instalación nueva). El runner de e2e corre
    // serial (--runInBand) y cada suite borra lo que crea en su propio
    // afterAll, así que en teoría ya debería estar vacía -- pero se borra
    // igual acá, de forma explícita, para que este test no dependa en
    // silencio del orden en que Jest descubre los archivos ni de que
    // ninguna otra suite haya dejado algo a medias.
    await prisma.auditLog.deleteMany({});
    await prisma.userRole.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdIds } } });
    await deleteUsers(prisma, createdIds);
    await app.close();
  });

  it('reports needsSetup: true when there are no users yet', async () => {
    const response = await request(app.getHttpServer())
      .get('/setup/status')
      .expect(200);
    expect(response.body).toEqual({ needsSetup: true });
  });

  it('creates the first admin, issues a token, sets up the main warehouse, and then blocks a second attempt', async () => {
    const email = `setup-admin-${Date.now()}@opera.local`;

    const created = await request(app.getHttpServer())
      .post('/setup/admin')
      .send({ name: 'Admin Inicial', email, password: 'Test-password-123!' })
      .expect(201);
    const body = created.body as { accessToken: string };
    expect(typeof body.accessToken).toBe('string');
    expect(body.accessToken.length).toBeGreaterThan(0);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    createdIds.push(user.id);

    const roles = await prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: true },
    });
    expect(roles.map((r) => r.role.name)).toEqual(['ADMIN']);

    const warehouse = await prisma.warehouse.findUnique({
      where: { name: 'Bodega principal' },
    });
    expect(warehouse).not.toBeNull();

    const statusAfter = await request(app.getHttpServer())
      .get('/setup/status')
      .expect(200);
    expect(statusAfter.body).toEqual({ needsSetup: false });

    await request(app.getHttpServer())
      .post('/setup/admin')
      .send({
        name: 'Otro',
        email: `otro-${Date.now()}@opera.local`,
        password: 'Test-password-123!',
      })
      .expect(409);

    const secondCount = await prisma.user.count();
    expect(secondCount).toBe(1);
  });
});
