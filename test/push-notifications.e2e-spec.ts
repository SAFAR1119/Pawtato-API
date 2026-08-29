import { INestApplication } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import request from 'supertest';
import type { Response } from 'supertest';
import type { App } from 'supertest/types';

import { createTestApp } from './test-app';
import { WebPushService } from '../src/modules/notifications/web-push.service';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

function data<T>(res: Response): T {
  return (res.body as ApiEnvelope<T>).data;
}

// Covers the real Web Push completion of Phase 17: registering/unregistering
// a browser subscription, and PushChannel actually calling WebPushService
// (the module's sole boundary to the `web-push` SDK, by design — see
// web-push.service.ts) with the right subscription and payload when a
// pushed-eligible domain event fires. WebPushService is overridden here the
// same way StripeService is overridden in tag-orders-flow.e2e-spec.ts: this
// proves PushChannel's own wiring end-to-end without needing a real browser
// or a real push service on the other end.
describe('Push notifications (e2e)', () => {
  let app: INestApplication<App>;
  let capturedOtp: string | undefined;

  const webPushServiceMock = {
    isConfigured: jest.fn().mockReturnValue(true),
    send: jest.fn().mockResolvedValue(undefined),
    isGoneError: jest.fn().mockReturnValue(false),
  };

  const password = 'StrongPass123';
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ownerEmail = `push-owner-${runId}@example.com`;

  let ownerAccessToken: string;

  async function registerAndVerify(fullName: string, email: string) {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ fullName, email, password })
      .expect(201);

    const verifyRes = await request(app.getHttpServer())
      .post('/api/auth/verify-otp')
      .send({ email, otp: capturedOtp })
      .expect(200);

    return data<{ accessToken: string }>(verifyRes).accessToken;
  }

  async function waitFor<T>(
    check: () => Promise<T | undefined>,
    { timeoutMs = 3000, intervalMs = 100 } = {},
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const result = await check();

      if (result !== undefined) {
        return result;
      }

      if (Date.now() > deadline) {
        throw new Error('waitFor: condition was never met in time');
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  beforeAll(async () => {
    const mailerService = {
      sendMail: jest.fn((options: { context?: Record<string, unknown> }) => {
        const otp = options.context?.otp;

        if (typeof otp === 'string') {
          capturedOtp = otp;
        }

        return Promise.resolve();
      }),
    };

    app = await createTestApp((builder) =>
      builder
        .overrideProvider(MailerService)
        .useValue(mailerService)
        .overrideProvider(WebPushService)
        .useValue(webPushServiceMock),
    );

    ownerAccessToken = await registerAndVerify('Push Owner', ownerEmail);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports null when the server has no VAPID keys configured', async () => {
    // WebPushService is overridden for this whole file, but the vapid-key
    // route reads straight from ConfigService, independent of that
    // override — the e2e env (test/global-setup.ts) never sets
    // VAPID_PUBLIC_KEY, so this exercises the real "not configured" path.
    const res = await request(app.getHttpServer())
      .get('/api/notifications/vapid-public-key')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(200);

    expect(data<{ publicKey: string | null }>(res)).toEqual({
      publicKey: null,
    });
  });

  describe('subscription lifecycle', () => {
    const endpoint = `https://push.example.com/${runId}`;

    it('registers a web push subscription', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/notifications/web-push-subscriptions')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          endpoint,
          keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
        })
        .expect(201);

      expect(data<{ endpoint: string; platform: string }>(res)).toEqual(
        expect.objectContaining({ endpoint, platform: 'WEB' }),
      );
    });

    it('re-registering the same endpoint updates rather than duplicates it', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/notifications/web-push-subscriptions')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          endpoint,
          keys: { p256dh: 'rotated-p256dh', auth: 'rotated-auth' },
        })
        .expect(201);

      expect(data<{ endpoint: string }>(res).endpoint).toBe(endpoint);
    });

    it("an unrelated user cannot unregister someone else's subscription", async () => {
      const intruderToken = await registerAndVerify(
        'Push Intruder',
        `push-intruder-${runId}@example.com`,
      );

      await request(app.getHttpServer())
        .delete('/api/notifications/web-push-subscriptions')
        .set('Authorization', `Bearer ${intruderToken}`)
        .query({ endpoint })
        .expect(404);
    });

    it('the owner unregisters their own subscription', async () => {
      await request(app.getHttpServer())
        .delete('/api/notifications/web-push-subscriptions')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .query({ endpoint })
        .expect(200);
    });

    it('unregistering the same endpoint again is a 404', async () => {
      await request(app.getHttpServer())
        .delete('/api/notifications/web-push-subscriptions')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .query({ endpoint })
        .expect(404);
    });
  });

  describe('a pushed-eligible event actually reaches WebPushService', () => {
    let petId: string;
    let tagPublicCode: string;
    const endpoint = `https://push.example.com/found-report-${runId}`;

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/api/notifications/web-push-subscriptions')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          endpoint,
          keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
        })
        .expect(201);

      const petRes = await request(app.getHttpServer())
        .post('/api/pets')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ name: 'Buddy', species: 'Dog', breed: 'Mixed', gender: 'MALE' })
        .expect(201);
      petId = data<{ _id: string }>(petRes)._id;

      const tagRes = await request(app.getHttpServer())
        .post('/api/tags')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ redirectBaseUrl: 'https://pawtato.ariyan.app/qr/' })
        .expect(201);
      tagPublicCode = data<{ publicCode: string }>(tagRes).publicCode;

      await request(app.getHttpServer())
        .post('/api/tags/assign')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ publicCode: tagPublicCode, petId })
        .expect(201);
    });

    it('a found-report submission triggers a real WebPushService.send call', async () => {
      webPushServiceMock.send.mockClear();

      await request(app.getHttpServer())
        .post(`/api/public/tags/${tagPublicCode}/found-report`)
        .field('message', 'Found near the dog park, safe and friendly.')
        .field('deviceFingerprint', 'e2e-push-device-fingerprint')
        .expect(201);

      await waitFor(() =>
        webPushServiceMock.send.mock.calls.length > 0 ? true : undefined,
      );

      expect(webPushServiceMock.send).toHaveBeenCalledTimes(1);
      const [subscription, payload] = webPushServiceMock.send.mock.calls[0] as [
        { endpoint: string; keys: { p256dh: string; auth: string } },
        string,
      ];
      expect(subscription.endpoint).toBe(endpoint);

      const parsed = JSON.parse(payload) as {
        title: string;
        data: { type: string; petId?: string };
      };
      expect(parsed.title).toBe('Someone may have found your pet!');
      expect(parsed.data).toEqual({
        type: 'found-report.created',
        petId,
      });
    });
  });
});
