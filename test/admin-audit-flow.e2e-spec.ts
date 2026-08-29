import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { MailerService } from '@nestjs-modules/mailer';
import request from 'supertest';
import type { Response } from 'supertest';
import type { App } from 'supertest/types';
import type { Model } from 'mongoose';

import { createTestApp } from './test-app';
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';
import { UserRole } from '../src/common/enums/user-role.enum';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

function data<T>(res: Response): T {
  return (res.body as ApiEnvelope<T>).data;
}

// Covers Phase 7 (Admin, Audit & Abuse Handling) end-to-end over real HTTP +
// a real DB: an admin manufactures a batch of unowned tags, an owner claims
// one and assigns it to a pet, an anonymous finder reports it, the admin
// reviews that report and separately suspends abusive inventory, blocks the
// owner, and every one of those actions shows up in the audit log — proving
// ActivityService.log() (previously never called anywhere — see the Phase 7
// roadmap entry) is now actually wired into the real request path.
describe('Admin, audit & abuse handling (e2e)', () => {
  let app: INestApplication<App>;
  let userModel: Model<UserDocument>;
  let capturedOtp: string | undefined;

  // A random suffix (not just Date.now()) avoids a collision with another
  // e2e spec file's own timestamp-based email — this whole suite shares one
  // throwaway MongoDB instance across files (see test/global-setup.ts), and
  // Jest starts worker processes close enough together that two files'
  // millisecond timestamps can otherwise match.
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = 'StrongPass123';
  const adminEmail = `admin-audit-admin-${runId}@example.com`;
  const ownerEmail = `admin-audit-owner-${runId}@example.com`;

  let adminAccessToken: string;
  let adminUserId: string;
  let ownerAccessToken: string;
  let ownerUserId: string;
  let petId: string;
  let claimedPublicCode: string;
  let unclaimedTagId: string;
  let foundReportId: string;

  async function registerAndVerify(fullName: string, email: string) {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ fullName, email, password })
      .expect(201);

    const verifyRes = await request(app.getHttpServer())
      .post('/api/auth/verify-otp')
      .send({ email, otp: capturedOtp })
      .expect(200);

    return data<{ accessToken: string; user: { id: string } }>(verifyRes);
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
      builder.overrideProvider(MailerService).useValue(mailerService),
    );

    userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
  });

  afterAll(async () => {
    await app.close();
  });

  it('promotes a freshly-registered account to ADMIN and re-logs-in for a token carrying that role', async () => {
    const { user } = await registerAndVerify('Ops Admin', adminEmail);
    adminUserId = user.id;

    await userModel.findByIdAndUpdate(user.id, { role: UserRole.ADMIN });

    // The JWT payload bakes in the role at issuance time (see
    // JwtStrategy.validate — it never re-derives role from the DB), so the
    // token from verify-otp above is still USER-scoped. A fresh login is
    // what actually picks up the DB change.
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);

    const login = data<{ accessToken: string; user: { role: string } }>(
      loginRes,
    );
    adminAccessToken = login.accessToken;
    expect(login.user.role).toBe(UserRole.ADMIN);
  });

  it('registers a regular owner account', async () => {
    const { accessToken, user } = await registerAndVerify(
      'Pet Owner',
      ownerEmail,
    );
    ownerAccessToken = accessToken;
    ownerUserId = user.id;
  });

  it('admin manufactures a batch of unowned tags', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tags/bulk')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        count: 2,
        redirectBaseUrl: 'https://pawtato.ariyan.app/qr/',
        batchLabel: 'e2e-batch',
      })
      .expect(201);

    const tags =
      data<Array<{ _id: string; status: string; publicCode: string }>>(res);
    expect(tags).toHaveLength(2);
    expect(tags.every((tag) => tag.status === 'MANUFACTURED')).toBe(true);

    claimedPublicCode = tags[0].publicCode;
    unclaimedTagId = tags[1]._id;
  });

  it('a non-admin cannot manufacture tags', async () => {
    await request(app.getHttpServer())
      .post('/api/tags/bulk')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ count: 1, redirectBaseUrl: 'https://pawtato.ariyan.app/qr/' })
      .expect(403);
  });

  it('the owner claims one of the manufactured tags into their own name', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tags/claim')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ publicCode: claimedPublicCode })
      .expect(201);

    expect(data<{ status: string }>(res).status).toBe('AVAILABLE');
  });

  it('the owner creates a pet and assigns the claimed tag to it', async () => {
    const petRes = await request(app.getHttpServer())
      .post('/api/pets')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ name: 'Milo', species: 'Cat', gender: 'MALE' })
      .expect(201);

    petId = data<{ _id: string }>(petRes)._id;

    const assignRes = await request(app.getHttpServer())
      .post('/api/tags/assign')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ publicCode: claimedPublicCode, petId })
      .expect(201);

    expect(data<{ status: string }>(assignRes).status).toBe('ASSIGNED');
  });

  it('an anonymous finder reports the pet found', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/public/tags/${claimedPublicCode}/found-report`)
      .field('message', 'Spam link: definitely-not-a-scam.example')
      .field('deviceFingerprint', 'e2e-admin-flow-device-001')
      .expect(201);

    expect(data<{ message: string }>(res)).toEqual({
      message: 'Thanks — the owner has been notified.',
    });
  });

  it('admin sees the found report in the moderation queue, PENDING by default', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/found-reports')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .query({ status: 'PENDING' })
      .expect(200);

    const page = data<{ foundReports: Array<{ _id: string; status: string }> }>(
      res,
    );
    expect(page.foundReports.length).toBeGreaterThan(0);
    expect(page.foundReports.every((r) => r.status === 'PENDING')).toBe(true);
    foundReportId = page.foundReports[0]._id;
  });

  it('a non-admin cannot see the moderation queue', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/found-reports')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(403);
  });

  it('admin dismisses the report as spam', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/found-reports/${foundReportId}/status`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ status: 'DISMISSED' })
      .expect(200);

    expect(data<{ status: string }>(res).status).toBe('DISMISSED');
  });

  it('admin suspends the remaining unclaimed tag', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/tags/${unclaimedTagId}/suspend`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(data<{ status: string }>(res).status).toBe('SUSPENDED');
  });

  it('a non-admin cannot read the audit log', async () => {
    // Checked before the block step below — once blocked, the owner's
    // existing token starts failing auth entirely (401 from JwtStrategy,
    // since isActive flips false), which would mask the role check this
    // test actually cares about.
    await request(app.getHttpServer())
      .get('/api/activity')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(403);
  });

  it('admin blocks the owner account', async () => {
    await request(app.getHttpServer())
      .patch(`/api/admin/users/${ownerUserId}/block`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
  });

  it('every one of those actions is now in the audit log', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/activity')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .query({ limit: 50 })
      .expect(200);

    const page = data<{ activities: Array<{ action: string }> }>(res);
    const actions = page.activities.map((entry) => entry.action);

    expect(actions).toEqual(
      expect.arrayContaining([
        'tag.bulk-created',
        'tag.claimed',
        'tag.assigned',
        'found-report.status-changed',
        'tag.suspended',
        'admin.user.blocked',
      ]),
    );
  });

  // Regression coverage for a real bug found while building Phase 16: the
  // audit log's `actor` field was stored as a raw string, not an ObjectId,
  // which silently broke both `.populate('actor', 'fullName email')` (the
  // actor's name/email never resolved) and the `?actor=` query filter — no
  // prior e2e spec asserted on either.
  it("each entry's actor is populated with fullName/email, not just a raw id", async () => {
    // Scoped to this test's own admin via ?actor= — an unscoped query would
    // also pick up activity entries from other e2e spec files sharing this
    // same throwaway MongoDB instance, some of which (by design — see
    // admin-user-deletion-cascade.e2e-spec.ts) legitimately reference a
    // since-deleted user and populate to null. That's correct behavior for
    // those entries, not something this test should be asserting against.
    const res = await request(app.getHttpServer())
      .get('/api/activity')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .query({ limit: 50, actor: adminUserId })
      .expect(200);

    const page = data<{
      activities: Array<{ actor: { fullName: string; email: string } }>;
    }>(res);

    expect(page.activities.length).toBeGreaterThan(0);
    for (const entry of page.activities) {
      expect(entry.actor).toEqual(
        expect.objectContaining({
          fullName: expect.any(String) as string,
          email: expect.any(String) as string,
        }),
      );
    }
  });

  it("filtering by ?actor= returns only that admin's own actions", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/activity')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .query({ limit: 50, actor: adminUserId })
      .expect(200);

    const page = data<{ activities: Array<{ action: string }> }>(res);

    expect(page.activities.length).toBeGreaterThan(0);
    expect(
      page.activities.some((entry) => entry.action === 'admin.user.blocked'),
    ).toBe(true);
  });
});
