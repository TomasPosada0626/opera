import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './support/test-app';

// Sin login: el health check lo consulta software de monitoreo, no un
// usuario logueado (ver comentario en HealthController).
describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports ok with the database reachable, no auth required', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    const body = response.body as {
      status: string;
      info: { database: { status: string } };
    };
    expect(body.status).toBe('ok');
    expect(body.info.database).toEqual({ status: 'up' });
  });
});
