import * as fs from 'fs';
import * as path from 'path';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { MailerService } from '@nestjs-modules/mailer';
import request from 'supertest';
import type { Response } from 'supertest';
import type { App } from 'supertest/types';
import { Types } from 'mongoose';
import type { Connection, Model } from 'mongoose';

import { createTestApp } from './test-app';
import { User } from '../src/modules/users/schemas/user.schema';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

function data<T>(res: Response): T {
  return (res.body as ApiEnvelope<T>).data;
}

// A tiny valid 1x1 transparent PNG — enough to pass imageFileFilter and
// actually be written to disk by LocalDiskStorageProvider, so this suite can
// assert real file cleanup, not just document cleanup.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

// Proves the ask behind this test suite end-to-end: deleting a user through
// the admin endpoint must cascade to *everything* connected to them — not
// just their pets, but every pet's tag, medical records, vaccinations, scan
// history, and found reports, plus every stored file (pet photo, found-
// report photo) — using a real HTTP + DB stack so the module-wiring change
// in AdminModule (now importing Tags/Scans/Notifications) is verified for
// real, not just against mocks.
describe('Admin user-deletion cascade (e2e)', () => {
  let app: INestApplication<App>;
  let connection: Connection;
  let userModel: Model<User>;
  let capturedOtp: string | undefined;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = 'StrongPass123';
  const adminEmail = `cascade-admin-${runId}@example.com`;
  const ownerEmail = `cascade-owner-${runId}@example.com`;
  const deviceFingerprint = `cascade-e2e-device-${runId}`;

  let adminAccessToken: string;
  let ownerAccessToken: string;
  let ownerUserId: string;
  let petId: string;
  let tagId: string;
  let tagPublicCode: string;
  let petPhotoPath: string;
  let foundReportPhotoPath: string;

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

  function uploadsPathFromUrl(url: string): string {
    return path.join(process.cwd(), url.replace(/^\/uploads\//, 'uploads/'));
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

    connection = app.get<Connection>(getConnectionToken());
    userModel = app.get<Model<User>>(getModelToken(User.name));
  });

  afterAll(async () => {
    await app.close();
  });

  it('promotes a freshly-registered account to ADMIN', async () => {
    const { user } = await registerAndVerify('Cascade Admin', adminEmail);

    await userModel.findByIdAndUpdate(user.id, { role: 'ADMIN' });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);

    adminAccessToken = data<{ accessToken: string }>(loginRes).accessToken;
  });

  it('registers the owner whose account/data will be deleted', async () => {
    const { accessToken, user } = await registerAndVerify(
      'Cascade Owner',
      ownerEmail,
    );
    ownerAccessToken = accessToken;
    ownerUserId = user.id;
  });

  it('the owner creates a pet and uploads a real photo for it', async () => {
    const petRes = await request(app.getHttpServer())
      .post('/api/pets')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ name: 'Cascade Cat', species: 'Cat', gender: 'FEMALE' })
      .expect(201);

    petId = data<{ _id: string }>(petRes)._id;

    const photoRes = await request(app.getHttpServer())
      .post(`/api/pets/${petId}/photo`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .attach('file', ONE_PIXEL_PNG, {
        filename: 'cat.png',
        contentType: 'image/png',
      })
      .expect(201);

    const profileImage = data<{ profileImage: string }>(photoRes).profileImage;
    petPhotoPath = uploadsPathFromUrl(profileImage);
    expect(fs.existsSync(petPhotoPath)).toBe(true);
  });

  it('the owner creates a tag and assigns it to the pet', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/tags')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ redirectBaseUrl: 'https://pawtato.ariyan.app/qr/' })
      .expect(201);

    const tag = data<{ _id: string; publicCode: string }>(createRes);
    tagId = tag._id;
    tagPublicCode = tag.publicCode;

    await request(app.getHttpServer())
      .post('/api/tags/assign')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ publicCode: tagPublicCode, petId })
      .expect(201);
  });

  it('the owner adds a medical record and a vaccination for the pet', async () => {
    await request(app.getHttpServer())
      .post(`/api/pets/${petId}/medical-records`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ title: 'Annual checkup' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/pets/${petId}/vaccinations`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({
        vaccineName: 'Rabies',
        administeredDate: '2026-01-15',
        nextDueDate: '2027-01-15',
      })
      .expect(201);
  });

  it('an anonymous finder scans the tag, recording a ScanEvent', async () => {
    await request(app.getHttpServer())
      .get(`/api/public/tags/${tagPublicCode}`)
      .expect(200);
  });

  it('an anonymous finder submits a found report with a real photo', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/public/tags/${tagPublicCode}/found-report`)
      .field('message', 'Found near the park')
      .field('deviceFingerprint', deviceFingerprint)
      .attach('photo', ONE_PIXEL_PNG, {
        filename: 'found.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(data<{ message: string }>(res).message).toBeDefined();

    const report = await connection.db
      .collection('foundreports')
      .findOne({ deviceFingerprint });

    expect(report?.photoUrl).toBeTruthy();
    foundReportPhotoPath = uploadsPathFromUrl(report!.photoUrl as string);
    expect(fs.existsSync(foundReportPhotoPath)).toBe(true);
  });

  it('the owner reports the pet lost, producing an in-app notification', async () => {
    await request(app.getHttpServer())
      .patch(`/api/pets/${petId}/report-lost`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({
        lastSeenLocation: 'Dhanmondi, Dhaka',
        lostDescription: 'Last seen near the park entrance.',
        emergencyContact: '+8801XXXXXXXXX',
      })
      .expect(200);

    await waitFor(async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);

      const page = data<{ notifications: Array<{ type: string }> }>(res);
      return page.notifications.find((n) => n.type === 'pet.marked-lost');
    });
  });

  it('every dependent collection has data for this owner before deletion', async () => {
    const petCount = await connection.db
      .collection('pets')
      .countDocuments({ owner: new Types.ObjectId(ownerUserId) });
    const notificationCount = await connection.db
      .collection('notifications')
      .countDocuments({ user: new Types.ObjectId(ownerUserId) });

    expect(petCount).toBeGreaterThan(0);
    expect(notificationCount).toBeGreaterThan(0);
  });

  it('admin deletes the user', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/admin/users/${ownerUserId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(data<{ message: string }>(res).message).toBe(
      'User deleted successfully',
    );
  });

  it('the user document itself is gone', async () => {
    const user = await userModel.findById(ownerUserId);
    expect(user).toBeNull();
  });

  it('every pet the user owned is gone', async () => {
    const count = await connection.db
      .collection('pets')
      .countDocuments({ owner: new Types.ObjectId(ownerUserId) });
    expect(count).toBe(0);

    const stillThere = await connection.db
      .collection('pets')
      .findOne({ _id: new Types.ObjectId(petId) });
    expect(stillThere).toBeNull();
  });

  it('the tag the user owned (and had assigned) is gone', async () => {
    const tag = await connection.db
      .collection('tags')
      .findOne({ _id: new Types.ObjectId(tagId) });
    expect(tag).toBeNull();
  });

  it('medical records and vaccinations for the pet are gone', async () => {
    const petObjectId = new Types.ObjectId(petId);

    const medicalCount = await connection.db
      .collection('medicalrecords')
      .countDocuments({ pet: petObjectId });
    const vaccinationCount = await connection.db
      .collection('vaccinations')
      .countDocuments({ pet: petObjectId });

    expect(medicalCount).toBe(0);
    expect(vaccinationCount).toBe(0);
  });

  it('scan events and found reports referencing the pet/tag are gone', async () => {
    const petObjectId = new Types.ObjectId(petId);
    const tagObjectId = new Types.ObjectId(tagId);

    const scanCount = await connection.db
      .collection('scanevents')
      .countDocuments({ $or: [{ pet: petObjectId }, { tag: tagObjectId }] });
    const foundReportCount = await connection.db
      .collection('foundreports')
      .countDocuments({ $or: [{ pet: petObjectId }, { tag: tagObjectId }] });

    expect(scanCount).toBe(0);
    expect(foundReportCount).toBe(0);
  });

  it('every notification for the user is gone', async () => {
    const count = await connection.db
      .collection('notifications')
      .countDocuments({ user: new Types.ObjectId(ownerUserId) });
    expect(count).toBe(0);
  });

  it('the pet photo and found-report photo files were deleted from disk', () => {
    expect(fs.existsSync(petPhotoPath)).toBe(false);
    expect(fs.existsSync(foundReportPhotoPath)).toBe(false);
  });

  it('the audit log records the deletion with the cascade counts', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/activity')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .query({ action: 'admin.user.deleted', limit: 10 })
      .expect(200);

    const page = data<{
      activities: Array<{
        action: string;
        target: string;
        metadata: { deletedPetCount: number; deletedTagCount: number };
      }>;
    }>(res);

    const entry = page.activities.find((a) => a.target === ownerUserId);
    expect(entry).toBeDefined();
    expect(entry!.metadata.deletedPetCount).toBe(1);
    expect(entry!.metadata.deletedTagCount).toBe(1);
  });
});
