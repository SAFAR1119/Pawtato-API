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
import { DOMAIN_EVENTS } from '../src/common/events/domain-events';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

function data<T>(res: Response): T {
  return (res.body as ApiEnvelope<T>).data;
}

// Phase 15 — Multiple authorized caretakers / shared pet access. Covers the
// whole feature end-to-end over real HTTP + a real DB: an owner grants a
// caretaker access to a pet, the caretaker can view/caretake it (medical
// records, vaccinations, scan/found-report history, report-lost/found) but
// not perform owner-only actions (profile edits, photo, delete, managing
// other caretakers), the owner-facing notification for a caretaker-filed
// lost report still goes to the real owner, and access is fully revocable
// both ways (owner removes, caretaker self-leaves).
describe('Shared pet access / caretakers (e2e)', () => {
  let app: INestApplication<App>;
  let userModel: Model<UserDocument>;
  let capturedOtp: string | undefined;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = 'StrongPass123';
  const ownerEmail = `caretaker-owner-${runId}@example.com`;
  const caretakerEmail = `caretaker-vet-${runId}@example.com`;
  const intruderEmail = `caretaker-intruder-${runId}@example.com`;

  let ownerAccessToken: string;
  let caretakerAccessToken: string;
  let intruderAccessToken: string;
  let petId: string;
  let caretakerRecordId: string;

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

  async function pollUntil<T>(
    fn: () => Promise<T>,
    predicate: (value: T) => boolean,
    timeoutMs = 2000,
    intervalMs = 50,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let last: T = await fn();

    while (!predicate(last) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      last = await fn();
    }

    return last;
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

  it('registers an owner, a caretaker, and an unrelated intruder', async () => {
    ownerAccessToken = (await registerAndVerify('Owner', ownerEmail))
      .accessToken;
    caretakerAccessToken = (await registerAndVerify('Dr. Vet', caretakerEmail))
      .accessToken;
    intruderAccessToken = (await registerAndVerify('Intruder', intruderEmail))
      .accessToken;
  });

  it('owner creates a pet', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/pets')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ name: 'Milo', species: 'Dog', gender: 'MALE' })
      .expect(201);

    petId = data<{ _id: string }>(res)._id;
  });

  describe('before being added, the caretaker has no access at all', () => {
    it('cannot view the pet', async () => {
      await request(app.getHttpServer())
        .get(`/api/pets/${petId}`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(404);
    });

    it('cannot report it lost', async () => {
      await request(app.getHttpServer())
        .patch(`/api/pets/${petId}/report-lost`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .send({
          lastSeenLocation: 'Gulshan',
          lostDescription: 'Ran off',
          emergencyContact: '+8801000000000',
        })
        .expect(404);
    });

    it("does not appear when listing the pet's caretakers, and is not visible in caretaking/pets", async () => {
      const listRes = await request(app.getHttpServer())
        .get(`/api/pets/${petId}/caretakers`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(data<Array<unknown>>(listRes)).toEqual([]);

      const mineRes = await request(app.getHttpServer())
        .get('/api/caretaking/pets')
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(200);
      expect(data<Array<unknown>>(mineRes)).toEqual([]);
    });
  });

  describe('granting access', () => {
    it('rejects adding a caretaker with no matching account', async () => {
      await request(app.getHttpServer())
        .post(`/api/pets/${petId}/caretakers`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ email: `nobody-${runId}@example.com` })
        .expect(404);
    });

    it('rejects adding yourself as a caretaker', async () => {
      await request(app.getHttpServer())
        .post(`/api/pets/${petId}/caretakers`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ email: ownerEmail })
        .expect(400);
    });

    it('a non-owner cannot grant caretaker access to someone else', async () => {
      await request(app.getHttpServer())
        .post(`/api/pets/${petId}/caretakers`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .send({ email: intruderEmail })
        .expect(404);
    });

    it('owner adds the caretaker by email', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/pets/${petId}/caretakers`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ email: caretakerEmail })
        .expect(201);

      const caretaker = data<{
        _id: string;
        userId: { email: string; fullName: string };
      }>(res);
      expect(caretaker.userId.email).toBe(caretakerEmail);
      caretakerRecordId = caretaker._id;
    });

    it('rejects adding the same caretaker twice', async () => {
      await request(app.getHttpServer())
        .post(`/api/pets/${petId}/caretakers`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ email: caretakerEmail })
        .expect(400);
    });
  });

  describe('once added, the caretaker can view and caretake the pet', () => {
    it('can view the pet', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/pets/${petId}`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(200);

      expect(data<{ name: string }>(res).name).toBe('Milo');
    });

    it("appears in GET /caretaking/pets, with the pet's info attached", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/caretaking/pets')
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(200);

      const rows = data<Array<{ petId: { _id: string; name: string } }>>(res);
      expect(
        rows.some((r) => r.petId._id === petId && r.petId.name === 'Milo'),
      ).toBe(true);
    });

    it('can add and list medical records', async () => {
      await request(app.getHttpServer())
        .post(`/api/pets/${petId}/medical-records`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .send({ title: 'Annual checkup' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/pets/${petId}/medical-records`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(200);

      expect(
        data<Array<{ title: string }>>(res).some(
          (r) => r.title === 'Annual checkup',
        ),
      ).toBe(true);
    });

    it('can add and list vaccinations', async () => {
      await request(app.getHttpServer())
        .post(`/api/pets/${petId}/vaccinations`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .send({
          vaccineName: 'Rabies',
          administeredDate: '2026-01-15',
          nextDueDate: '2027-01-15',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/pets/${petId}/vaccinations`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(200);

      expect(
        data<Array<{ vaccineName: string }>>(res).some(
          (v) => v.vaccineName === 'Rabies',
        ),
      ).toBe(true);
    });

    it('can view scan and found-report history (empty, but accessible)', async () => {
      await request(app.getHttpServer())
        .get(`/api/pets/${petId}/scans`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/pets/${petId}/found-reports`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(200);
    });

    it("can see the pet's caretaker list (transparency)", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/pets/${petId}/caretakers`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(200);

      expect(data<Array<{ _id: string }>>(res).length).toBe(1);
    });
  });

  describe('the caretaker cannot perform owner-only actions', () => {
    it('cannot update the pet profile', async () => {
      await request(app.getHttpServer())
        .patch(`/api/pets/${petId}`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .send({ name: 'Hijacked' })
        .expect(404);
    });

    it('cannot delete the pet', async () => {
      await request(app.getHttpServer())
        .delete(`/api/pets/${petId}`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(404);
    });

    it('cannot add another caretaker', async () => {
      await request(app.getHttpServer())
        .post(`/api/pets/${petId}/caretakers`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .send({ email: intruderEmail })
        .expect(404);
    });

    it('cannot remove another caretaker (only the owner can)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/pets/${petId}/caretakers/${caretakerRecordId}`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(404);
    });
  });

  describe('a caretaker reporting the pet lost notifies the real owner, not the caretaker', () => {
    it('caretaker reports the pet lost', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/pets/${petId}/report-lost`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .send({
          lastSeenLocation: 'Gulshan',
          lostDescription: 'Slipped the leash',
          emergencyContact: '+8801000000000',
        })
        .expect(200);

      expect(data<{ isLost: boolean }>(res).isLost).toBe(true);
    });

    it('the owner (not the caretaker) receives the pet.marked-lost notification', async () => {
      async function ownerNotifications() {
        const res = await request(app.getHttpServer())
          .get('/api/notifications')
          .set('Authorization', `Bearer ${ownerAccessToken}`)
          .query({ limit: 100 })
          .expect(200);

        return data<{ notifications: Array<{ type: string }> }>(res)
          .notifications;
      }

      const notifications = await pollUntil(ownerNotifications, (list) =>
        list.some((n) => n.type === 'pet.marked-lost'),
      );
      expect(notifications.some((n) => n.type === 'pet.marked-lost')).toBe(
        true,
      );
    });

    it('caretaker reports the pet found again, so later assertions start clean', async () => {
      await request(app.getHttpServer())
        .patch(`/api/pets/${petId}/report-found`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(200);
    });
  });

  it('a third, unrelated user has no access at all', async () => {
    await request(app.getHttpServer())
      .get(`/api/pets/${petId}`)
      .set('Authorization', `Bearer ${intruderAccessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/pets/${petId}/caretakers`)
      .set('Authorization', `Bearer ${intruderAccessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/pets/${petId}/caretakers/me`)
      .set('Authorization', `Bearer ${intruderAccessToken}`)
      .expect(404);
  });

  describe('revoking access', () => {
    it('the caretaker can voluntarily leave', async () => {
      await request(app.getHttpServer())
        .delete(`/api/pets/${petId}/caretakers/me`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/pets/${petId}`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(404);
    });

    it('leaving again is a clean 404, not a crash', async () => {
      await request(app.getHttpServer())
        .delete(`/api/pets/${petId}/caretakers/me`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(404);
    });

    it('owner re-adds the caretaker, then removes them directly', async () => {
      const addRes = await request(app.getHttpServer())
        .post(`/api/pets/${petId}/caretakers`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ email: caretakerEmail })
        .expect(201);
      const newCaretakerId = data<{ _id: string }>(addRes)._id;

      await request(app.getHttpServer())
        .get(`/api/pets/${petId}`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/pets/${petId}/caretakers/${newCaretakerId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/pets/${petId}`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .expect(404);
    });
  });

  it('every caretaker action taken above is recorded in the audit log', async () => {
    const adminEmail = `caretaker-admin-${runId}@example.com`;
    const { user } = await registerAndVerify('Caretaker Admin', adminEmail);
    await userModel.findByIdAndUpdate(user.id, { role: UserRole.ADMIN });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);
    const adminAccessToken = data<{ accessToken: string }>(
      loginRes,
    ).accessToken;

    const res = await request(app.getHttpServer())
      .get('/api/activity')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .query({ limit: 200 })
      .expect(200);

    const actions = data<{ activities: Array<{ action: string }> }>(
      res,
    ).activities.map((entry) => entry.action);

    expect(actions).toEqual(
      expect.arrayContaining([
        'pet.caretaker.added',
        'pet.caretaker.removed',
        'pet.caretaker.left',
        DOMAIN_EVENTS.PET_MARKED_LOST,
      ]),
    );
  });
});
