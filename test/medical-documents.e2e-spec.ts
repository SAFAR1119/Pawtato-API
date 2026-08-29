import { INestApplication } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import request from 'supertest';
import type { Response } from 'supertest';
import type { App } from 'supertest/types';
import * as fs from 'fs';
import * as path from 'path';

import { createTestApp } from './test-app';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

function data<T>(res: Response): T {
  return (res.body as ApiEnvelope<T>).data;
}

// Verifies a stored file directly on disk rather than fetching its public
// URL over HTTP — `ServeStaticModule`'s static-file route isn't reachable
// through `Test.createTestingModule`'s testing harness (confirmed directly:
// the identical route returns 200 under a real `NestFactory.create()` boot,
// so this is a harness limitation, not a product bug) — so this is both a
// workaround and, for verifying deletion, actually the more precise check.
function uploadedFileExists(url: string): boolean {
  const prefix = '/uploads/';

  if (!url.startsWith(prefix)) {
    throw new Error(`Unexpected local storage URL shape: ${url}`);
  }

  return fs.existsSync(
    path.join(process.cwd(), 'uploads', url.slice(prefix.length)),
  );
}

// PetsService.remove()'s PET_DELETED event is fire-and-forget (EventEmitter2's
// plain `emit()`, never awaited) — MedicalService/VaccinationsService's own
// cascade listener runs asynchronously after the DELETE response has already
// been sent, the same eventual-consistency gap documented and worked around
// in pet-dating-flow.e2e-spec.ts/shared-pet-access.e2e-spec.ts. Poll instead
// of asserting immediately.
async function pollUntil<T>(
  fn: () => T,
  predicate: (value: T) => boolean,
  timeoutMs = 2000,
  intervalMs = 50,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = fn();

  while (!predicate(last) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    last = fn();
  }

  return last;
}

// A tiny valid 1x1 transparent PNG — same fixture used elsewhere in this
// test suite (e.g. pet-dating-flow.e2e-spec.ts's identity-verification
// block) for real multipart upload coverage.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

// Not a real PDF, just a buffer with a plausible header — the server only
// validates mimetype via multer's fileFilter, never the file's actual
// content, so this is enough to exercise the upload path realistically.
const FAKE_PDF = Buffer.from('%PDF-1.4\n%fake pdf content for testing\n');

// Phase 16 — Expanded Medical Records (documents/certificates). Covers both
// medical-record and vaccination document attachments end-to-end: upload
// (image and PDF), rejection of a disallowed file type, removal (with the
// underlying file actually deleted from disk), a caretaker (Phase 15)
// exercising the same endpoints, and an unrelated user's access being
// rejected.
describe('Medical record & vaccination document attachments (e2e)', () => {
  let app: INestApplication<App>;
  let capturedOtp: string | undefined;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = 'StrongPass123';
  const ownerEmail = `med-doc-owner-${runId}@example.com`;
  const caretakerEmail = `med-doc-caretaker-${runId}@example.com`;
  const intruderEmail = `med-doc-intruder-${runId}@example.com`;

  let ownerAccessToken: string;
  let caretakerAccessToken: string;
  let intruderAccessToken: string;
  let petId: string;
  let recordId: string;
  let vaccinationId: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers an owner, a caretaker, and an unrelated intruder', async () => {
    ownerAccessToken = (await registerAndVerify('Owner', ownerEmail))
      .accessToken;
    caretakerAccessToken = (
      await registerAndVerify('Caretaker', caretakerEmail)
    ).accessToken;
    intruderAccessToken = (await registerAndVerify('Intruder', intruderEmail))
      .accessToken;
  });

  it('owner creates a pet, a medical record, and a vaccination record', async () => {
    const petRes = await request(app.getHttpServer())
      .post('/api/pets')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ name: 'Rex', species: 'Dog', gender: 'MALE' })
      .expect(201);
    petId = data<{ _id: string }>(petRes)._id;

    const recordRes = await request(app.getHttpServer())
      .post(`/api/pets/${petId}/medical-records`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ title: 'Annual checkup' })
      .expect(201);
    recordId = data<{ _id: string }>(recordRes)._id;

    const vaccinationRes = await request(app.getHttpServer())
      .post(`/api/pets/${petId}/vaccinations`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({
        vaccineName: 'Rabies',
        administeredDate: '2026-01-15',
        nextDueDate: '2027-01-15',
      })
      .expect(201);
    vaccinationId = data<{ _id: string }>(vaccinationRes)._id;
  });

  it('owner grants the caretaker access to the pet', async () => {
    await request(app.getHttpServer())
      .post(`/api/pets/${petId}/caretakers`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ email: caretakerEmail })
      .expect(201);
  });

  describe('medical record documents', () => {
    it('rejects a disallowed file type', async () => {
      await request(app.getHttpServer())
        .post(`/api/pets/${petId}/medical-records/${recordId}/documents`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .attach('file', Buffer.from('not a real file'), {
          filename: 'malware.exe',
          contentType: 'application/x-msdownload',
        })
        .expect(400);
    });

    it('owner uploads an image document', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/pets/${petId}/medical-records/${recordId}/documents`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .attach('file', ONE_PIXEL_PNG, {
          filename: 'xray.png',
          contentType: 'image/png',
        })
        .expect(201);

      const record = data<{
        documents: Array<{ _id: string; fileName: string; url: string }>;
      }>(res);
      expect(record.documents.length).toBe(1);
      expect(record.documents[0].fileName).toBe('xray.png');
      expect(uploadedFileExists(record.documents[0].url)).toBe(true);
    });

    it('a caretaker can also upload a PDF document to the same record', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/pets/${petId}/medical-records/${recordId}/documents`)
        .set('Authorization', `Bearer ${caretakerAccessToken}`)
        .attach('file', FAKE_PDF, {
          filename: 'lab-results.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const record = data<{ documents: Array<{ fileName: string }> }>(res);
      expect(record.documents.length).toBe(2);
      expect(
        record.documents.some((d) => d.fileName === 'lab-results.pdf'),
      ).toBe(true);
    });

    it('an unrelated user cannot upload to, or view, this record', async () => {
      await request(app.getHttpServer())
        .post(`/api/pets/${petId}/medical-records/${recordId}/documents`)
        .set('Authorization', `Bearer ${intruderAccessToken}`)
        .attach('file', ONE_PIXEL_PNG, {
          filename: 'xray.png',
          contentType: 'image/png',
        })
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/pets/${petId}/medical-records`)
        .set('Authorization', `Bearer ${intruderAccessToken}`)
        .expect(404);
    });

    it('removes a document, and its file is deleted from disk', async () => {
      const listRes = await request(app.getHttpServer())
        .get(`/api/pets/${petId}/medical-records`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);

      const [record] =
        data<
          Array<{ _id: string; documents: Array<{ _id: string; url: string }> }>
        >(listRes);
      const [firstDoc] = record.documents;

      const removeRes = await request(app.getHttpServer())
        .delete(
          `/api/pets/${petId}/medical-records/${recordId}/documents/${firstDoc._id}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);

      const updated = data<{ documents: Array<{ _id: string }> }>(removeRes);
      expect(updated.documents.some((d) => d._id === firstDoc._id)).toBe(false);
      expect(updated.documents.length).toBe(1);
      expect(uploadedFileExists(firstDoc.url)).toBe(false);
    });

    it('removing an already-removed document is a clean 404', async () => {
      const listRes = await request(app.getHttpServer())
        .get(`/api/pets/${petId}/medical-records`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      const [record] =
        data<Array<{ documents: Array<{ _id: string }> }>>(listRes);
      const remainingDocId = record.documents[0]._id;

      await request(app.getHttpServer())
        .delete(
          `/api/pets/${petId}/medical-records/${recordId}/documents/${remainingDocId}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(
          `/api/pets/${petId}/medical-records/${recordId}/documents/${remainingDocId}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(404);
    });
  });

  describe('vaccination documents', () => {
    it('owner uploads a certificate to the vaccination record', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/pets/${petId}/vaccinations/${vaccinationId}/documents`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .attach('file', FAKE_PDF, {
          filename: 'rabies-certificate.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const vaccination = data<{
        documents: Array<{ _id: string; fileName: string; url: string }>;
      }>(res);
      expect(vaccination.documents.length).toBe(1);
      expect(uploadedFileExists(vaccination.documents[0].url)).toBe(true);
    });

    it('removes the certificate, and its file is deleted from disk', async () => {
      const listRes = await request(app.getHttpServer())
        .get(`/api/pets/${petId}/vaccinations`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      const [vaccination] =
        data<Array<{ documents: Array<{ _id: string; url: string }> }>>(
          listRes,
        );
      const [doc] = vaccination.documents;

      await request(app.getHttpServer())
        .delete(
          `/api/pets/${petId}/vaccinations/${vaccinationId}/documents/${doc._id}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);

      expect(uploadedFileExists(doc.url)).toBe(false);
    });
  });

  describe('pet deletion cascades stored document files', () => {
    it('uploads a fresh document, deletes the pet, and confirms the file is gone', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post(`/api/pets/${petId}/medical-records/${recordId}/documents`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .attach('file', ONE_PIXEL_PNG, {
          filename: 'final.png',
          contentType: 'image/png',
        })
        .expect(201);

      const record = data<{ documents: Array<{ url: string }> }>(uploadRes);
      const fileUrl = record.documents[record.documents.length - 1].url;

      expect(uploadedFileExists(fileUrl)).toBe(true);

      await request(app.getHttpServer())
        .delete(`/api/pets/${petId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);

      const stillExists = await pollUntil(
        () => uploadedFileExists(fileUrl),
        (exists) => exists === false,
      );
      expect(stillExists).toBe(false);
    });
  });
});
