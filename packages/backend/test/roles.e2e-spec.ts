import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/test-app';
import { createUserAndLogin, deleteUsers } from './support/fixtures';

describe('Roles (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminUserId: string;
  let staffToken: string;
  let staffUserId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'roles-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;

    const staff = await createUserAndLogin(app, prisma, {
      emailPrefix: 'roles-staff',
    });
    staffUserId = staff.id;
    staffToken = staff.token;
  });

  afterAll(async () => {
    await deleteUsers(prisma, [adminUserId, staffUserId]);
    await app.close();
  });

  it('GET /roles lists the ADMIN role for an admin', async () => {
    const response = await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const roles = response.body as { id: string; name: string }[];
    expect(roles.some((role) => role.name === 'ADMIN')).toBe(true);
  });

  it('rejects a user without the ADMIN role', async () => {
    await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/roles').expect(401);
  });
});
