import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import { createTestApp } from './test-app';

// A minimal smoke test: the app boots end-to-end (real DI graph, real
// Mongo connection) and the liveness route responds. Everything else
// (auth, ownership, the lost/found flow, rate limiting) lives in
// lost-and-found-flow.e2e-spec.ts.
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/health (GET) reports the service as up', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          status: 'ok',
          dependencies: expect.objectContaining({
            database: { status: 'up', readyState: 1 },
          }) as unknown,
        }) as unknown,
      }),
    );
  });
});
