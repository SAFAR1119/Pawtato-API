import { INestApplication } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import request from 'supertest';
import type { Response } from 'supertest';
import type { App } from 'supertest/types';

import { createTestApp } from './test-app';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

// The ResponseInterceptor wraps every success body as { success, message,
// data }; supertest types `.body` as `any`, so this is the one place that
// casts it back to something type-checked instead of scattering casts
// (and no-unsafe-member-access suppressions) through every assertion below.
function data<T>(res: Response): T {
  return (res.body as ApiEnvelope<T>).data;
}

// Covers the spec §27/§30 end-to-end scenario: register → verify → create a
// pet → create and assign a QR tag → an anonymous finder scans it and
// reports it found → the owner is notified → the owner marks it found.
// Alongside that, this file also covers the two other Phase 6 e2e-worthy
// concerns that don't fit a mocked unit test: ownership bypass attempts
// against a live HTTP+DB stack, and rate-limiting actually kicking in.
describe('Lost & found flow (e2e)', () => {
  let app: INestApplication<App>;
  let capturedOtp: string | undefined;

  const password = 'StrongPass123';
  const ownerEmail = `owner-${Date.now()}@example.com`;

  let accessToken: string;
  let petId: string;
  let tagPublicCode: string;

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
      // Registration/verification only ever reaches the caller through a
      // real mailbox in production — capturing the OTP here (never
      // persisted in plaintext anywhere, including the DB) is the only way
      // to drive the verify-otp step from an automated test.
      sendMail: jest.fn((options: { context?: Record<string, unknown> }) => {
        const otp = options.context?.otp;

        if (typeof otp === 'string') {
          capturedOtp = otp;
        }

        return Promise.resolve();
      }),
    };

    app = await createTestApp((builder) =>
      builder.overrideProvider(MailerService).useValue(mailerService),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a new account and sends an OTP instead of an access token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ fullName: 'Pet Owner', email: ownerEmail, password })
      .expect(201);

    expect(data<{ status: string }>(res).status).toBe('PENDING_VERIFICATION');
    expect(capturedOtp).toMatch(/^\d{6}$/);
  });

  it('verifies the OTP and receives an access token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/verify-otp')
      .send({ email: ownerEmail, otp: capturedOtp })
      .expect(200);

    const body = data<{ accessToken: string; user: { status: string } }>(res);
    accessToken = body.accessToken;
    expect(accessToken).toEqual(expect.any(String));
    expect(body.user.status).toBe('ACTIVE');
  });

  it('creates a pet for the caller', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/pets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Milo', species: 'Cat', breed: 'Persian', gender: 'MALE' })
      .expect(201);

    const pet = data<{ _id: string; isLost: boolean }>(res);
    petId = pet._id;
    expect(petId).toEqual(expect.any(String));
    expect(pet.isLost).toBe(false);
  });

  it('creates a QR tag and assigns it to the pet', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/tags')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ redirectBaseUrl: 'https://pawtato.ariyan.app/qr/' })
      .expect(201);

    const tag = data<{ publicCode: string; status: string }>(createRes);
    tagPublicCode = tag.publicCode;
    expect(tagPublicCode).toEqual(expect.any(String));
    expect(tag.status).toBe('AVAILABLE');

    const assignRes = await request(app.getHttpServer())
      .post('/api/tags/assign')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ publicCode: tagPublicCode, petId })
      .expect(201);

    expect(data<{ status: string }>(assignRes).status).toBe('ASSIGNED');
  });

  it('a finder scans the tag with no authentication and sees the public profile, never the owner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/public/tags/${tagPublicCode}`)
      .expect(200);

    const profile = data<Record<string, unknown>>(res);
    expect(profile.name).toBe('Milo');
    expect(profile.petStatus).toBe('SAFE');
    expect(profile).not.toHaveProperty('owner');
    expect(profile).not.toHaveProperty('_id');
  });

  it('is not listed as lost yet', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/public/lost-pets')
      .expect(200);

    const entries = data<Array<{ publicCode: string }>>(res);
    expect(entries.some((pet) => pet.publicCode === tagPublicCode)).toBe(false);
  });

  it('owner reports the pet lost', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/pets/${petId}/report-lost`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        lastSeenLocation: 'Dhanmondi, Dhaka',
        lostDescription: 'Last seen near Road 27, wearing a red collar.',
        emergencyContact: '+8801XXXXXXXXX',
      })
      .expect(200);

    expect(data<{ isLost: boolean }>(res).isLost).toBe(true);
  });

  it('now shows up in the public lost-pets list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/public/lost-pets')
      .expect(200);

    const entries = data<Array<{ publicCode: string }>>(res);
    expect(entries.some((pet) => pet.publicCode === tagPublicCode)).toBe(true);
  });

  it('a finder submits a found report with no account and no reused identifiers leaked back', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/public/tags/${tagPublicCode}/found-report`)
      .field('message', 'Found near Road 27, looks healthy and friendly.')
      .field('deviceFingerprint', 'e2e-device-fingerprint-001')
      .expect(201);

    expect(data<{ message: string }>(res)).toEqual({
      message: 'Thanks — the owner has been notified.',
    });
  });

  it('the owner sees an in-app notification for the found report', async () => {
    interface NotificationsPage {
      notifications: Array<{ type: string }>;
    }

    const found = await waitFor(async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const page = data<NotificationsPage>(res);

      return page.notifications.find((n) => n.type === 'found-report.created');
    });

    expect(found).toBeDefined();
  });

  // Regression coverage for a real bug found while building Phase 16: these
  // two owner-facing history endpoints query by `pet` with the caller's
  // petId, and (until fixed) the underlying records were stored with `pet`
  // as a differently-typed value than the query used, so results always
  // came back empty despite the finder's scan/report genuinely existing —
  // no prior e2e spec ever asserted on these two routes' actual content.
  it("the owner's scan history includes the finder's anonymous scan", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pets/${petId}/scans`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const scans = data<Array<{ _id: string }>>(res);
    expect(scans.length).toBeGreaterThan(0);
  });

  it("the owner's found-report history includes the finder's report", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pets/${petId}/found-reports`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const reports = data<Array<{ message: string }>>(res);
    expect(
      reports.some((r) =>
        r.message.includes('Found near Road 27, looks healthy'),
      ),
    ).toBe(true);
  });

  it('owner marks the pet found, clearing lost status', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/pets/${petId}/report-found`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(data<{ isLost: boolean }>(res).isLost).toBe(false);
  });

  it('drops back out of the public lost-pets list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/public/lost-pets')
      .expect(200);

    const entries = data<Array<{ publicCode: string }>>(res);
    expect(entries.some((pet) => pet.publicCode === tagPublicCode)).toBe(false);
  });

  // Phase 18 (Nearby Lost-Pet Discovery) shipped without e2e coverage —
  // this closes that gap against a real DB with a real 2dsphere index,
  // not just the unit-mocked aggregation assertions it had before.
  describe('nearby lost-pet discovery (geo search)', () => {
    const gulshanLat = 23.7925;
    const gulshanLng = 90.4078;
    // Chittagong — genuinely far from Gulshan, well outside any radius used below.
    const chittagongLat = 22.3569;
    const chittagongLng = 91.7832;

    it('reports a pet lost with coordinates and finds it via nearby search within radius', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/pets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Rex', species: 'Dog', breed: 'Mixed', gender: 'MALE' })
        .expect(201);

      const geoPetId = data<{ _id: string }>(createRes)._id;

      await request(app.getHttpServer())
        .patch(`/api/pets/${geoPetId}/report-lost`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          lastSeenLocation: 'Gulshan, Dhaka',
          lostDescription: 'Seen near the lake.',
          emergencyContact: '+8801XXXXXXXXX',
          lat: gulshanLat,
          lng: gulshanLng,
        })
        .expect(200);

      const nearbyRes = await request(app.getHttpServer())
        .get('/api/public/lost-pets/nearby')
        .query({ lat: gulshanLat, lng: gulshanLng, radiusKm: 5 })
        .expect(200);

      const entries =
        data<Array<{ name: string; distanceKm: number }>>(nearbyRes);
      const match = entries.find((pet) => pet.name === 'Rex');
      expect(match).toBeDefined();
      expect(match?.distanceKm).toBeLessThanOrEqual(5);

      const farRes = await request(app.getHttpServer())
        .get('/api/public/lost-pets/nearby')
        .query({ lat: chittagongLat, lng: chittagongLng, radiusKm: 5 })
        .expect(200);

      expect(
        data<Array<{ name: string }>>(farRes).some((pet) => pet.name === 'Rex'),
      ).toBe(false);

      // Cleanup so this pet doesn't leak into the rate-limit block below.
      await request(app.getHttpServer())
        .patch(`/api/pets/${geoPetId}/report-found`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('a pet reported lost with only a text location is absent from geo search but present in the plain listing', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/pets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Whiskers',
          species: 'Cat',
          breed: 'Mixed',
          gender: 'FEMALE',
        })
        .expect(201);

      const textOnlyPetId = data<{ _id: string }>(createRes)._id;

      await request(app.getHttpServer())
        .patch(`/api/pets/${textOnlyPetId}/report-lost`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          lastSeenLocation: 'Somewhere in Dhaka',
          lostDescription: 'No coordinates supplied.',
          emergencyContact: '+8801XXXXXXXXX',
        })
        .expect(200);

      const nearbyRes = await request(app.getHttpServer())
        .get('/api/public/lost-pets/nearby')
        .query({ lat: gulshanLat, lng: gulshanLng, radiusKm: 100 })
        .expect(200);

      expect(
        data<Array<{ name: string }>>(nearbyRes).some(
          (pet) => pet.name === 'Whiskers',
        ),
      ).toBe(false);

      const listRes = await request(app.getHttpServer())
        .get('/api/public/lost-pets')
        .expect(200);

      expect(
        data<Array<{ name: string }>>(listRes).some(
          (pet) => pet.name === 'Whiskers',
        ),
      ).toBe(true);

      // Cleanup so this pet doesn't leak into the rate-limit block below.
      await request(app.getHttpServer())
        .patch(`/api/pets/${textOnlyPetId}/report-found`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  describe('ownership bypass attempts', () => {
    let intruderAccessToken: string;

    beforeAll(async () => {
      const intruderEmail = `intruder-${Date.now()}@example.com`;

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ fullName: 'Intruder', email: intruderEmail, password })
        .expect(201);

      const verifyRes = await request(app.getHttpServer())
        .post('/api/auth/verify-otp')
        .send({ email: intruderEmail, otp: capturedOtp })
        .expect(200);

      intruderAccessToken = data<{ accessToken: string }>(
        verifyRes,
      ).accessToken;
    });

    it("rejects fetching another user's pet by id with a 404, not a 403", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/pets/${petId}`)
        .set('Authorization', `Bearer ${intruderAccessToken}`)
        .expect(404);

      expect((res.body as { success: boolean }).success).toBe(false);
    });

    it("rejects marking another user's pet lost", async () => {
      await request(app.getHttpServer())
        .patch(`/api/pets/${petId}/report-lost`)
        .set('Authorization', `Bearer ${intruderAccessToken}`)
        .send({
          lastSeenLocation: 'Nowhere',
          lostDescription: 'Not actually the owner.',
          emergencyContact: '+8801XXXXXXXXX',
        })
        .expect(404);
    });

    it('rejects assigning a tag the caller does not own', async () => {
      await request(app.getHttpServer())
        .post('/api/tags/assign')
        .set('Authorization', `Bearer ${intruderAccessToken}`)
        .send({ publicCode: tagPublicCode, petId })
        .expect(403);
    });

    it('rejects unauthenticated access entirely', async () => {
      await request(app.getHttpServer()).get('/api/pets').expect(401);
    });
  });

  describe('rate limiting on public endpoints', () => {
    it('returns 429 once the public tier burst limit is exceeded', async () => {
      // The `public` throttle tier on this route is 20 req/min; a couple of
      // earlier tests in this file already used a few of those, so this
      // comfortably crosses the limit within the same window.
      let sawTooManyRequests = false;

      for (let i = 0; i < 25; i++) {
        const res = await request(app.getHttpServer()).get(
          '/api/public/lost-pets',
        );

        if (res.status === 429) {
          sawTooManyRequests = true;
          break;
        }
      }

      expect(sawTooManyRequests).toBe(true);
    });
  });
});
