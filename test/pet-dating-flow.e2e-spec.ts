import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { MailerService } from '@nestjs-modules/mailer';
import request from 'supertest';
import type { Response } from 'supertest';
import type { App } from 'supertest/types';
import type { Model } from 'mongoose';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

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

// A tiny valid 1x1 transparent PNG — enough to pass imageFileFilter and
// actually be written to disk, so the identity-verification block below can
// exercise the real private-storage path, not just a mocked one.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const DATING_PHOTOS = ['https://your-app.example/uploads/pets/photo1.png'];

// Covers Phase 10 (Pet Dating & Companion Matching) *and* Phase 11's rework
// (mode split, identity verification + explicit per-match NID sharing)
// end-to-end over real HTTP + a real DB: two owners each opt a pet into
// dating, discover each other in PLAYDATE, swipe, match on a mutual LIKE,
// exchange a message, report/moderation, then both submit identity
// verification, get approved, and exercise the share/view NID flow within
// their existing match. Also proves the Phase 11 mode-split guards
// explicitly: BREEDING is species-restricted, PLAYDATE is not.
describe('Pet dating flow (e2e)', () => {
  let app: INestApplication<App>;
  let userModel: Model<UserDocument>;
  let capturedOtp: string | undefined;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = 'StrongPass123';
  const adminEmail = `dating-admin-${runId}@example.com`;
  const ownerAEmail = `dating-owner-a-${runId}@example.com`;
  const ownerBEmail = `dating-owner-b-${runId}@example.com`;

  let adminAccessToken: string;
  let ownerAAccessToken: string;
  let ownerBAccessToken: string;
  let petAId: string;
  let petBId: string;
  let matchId: string;
  let reportId: string;

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

    // A real listening port is needed for the WebSocket gateway block below
    // — socket.io-client needs an actual TCP/HTTP upgrade target, unlike
    // supertest's in-process request driving used everywhere else in this
    // file (supertest still works fine against an already-listening server).
    await app.listen(0);
    const httpServer = app.getHttpServer() as Server;
    const port = (httpServer.address() as AddressInfo).port;
    socketBaseUrl = `http://127.0.0.1:${port}/dating`;

    userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
  });

  afterAll(async () => {
    await app.close();
  });

  let socketBaseUrl: string;

  function connectSocket(accessToken: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(socketBaseUrl, {
        auth: { token: accessToken },
        transports: ['websocket'],
        forceNew: true,
      });

      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (error: Error) => reject(error));
    });
  }

  function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve) => {
      socket.once(event, (payload: T) => resolve(payload));
    });
  }

  // DatingChatNotificationListener reacts to the same DATING_MESSAGE_SENT
  // domain event DatingGateway does, via EventEmitter2's plain (non-awaited)
  // `emit()` — the same eventual-consistency gap the socket assertions above
  // work around with `waitForEvent`. There's no socket hook for a REST-only
  // assertion like "the notification now exists", so this polls the unread
  // summary instead of asserting immediately after a message send.
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

  it('promotes a freshly-registered account to ADMIN', async () => {
    const { user } = await registerAndVerify('Dating Admin', adminEmail);

    await userModel.findByIdAndUpdate(user.id, { role: UserRole.ADMIN });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);

    adminAccessToken = data<{ accessToken: string }>(loginRes).accessToken;
  });

  it('registers two owners, each with a cat', async () => {
    const ownerA = await registerAndVerify('Owner A', ownerAEmail);
    ownerAAccessToken = ownerA.accessToken;

    const ownerB = await registerAndVerify('Owner B', ownerBEmail);
    ownerBAccessToken = ownerB.accessToken;

    const petARes = await request(app.getHttpServer())
      .post('/api/pets')
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .send({ name: 'Dating Cat A', species: 'Cat', gender: 'MALE' })
      .expect(201);
    petAId = data<{ _id: string }>(petARes)._id;

    const petBRes = await request(app.getHttpServer())
      .post('/api/pets')
      .set('Authorization', `Bearer ${ownerBAccessToken}`)
      .send({ name: 'Dating Cat B', species: 'Cat', gender: 'FEMALE' })
      .expect(201);
    petBId = data<{ _id: string }>(petBRes)._id;
  });

  it('rejects a pet with no gender', async () => {
    await request(app.getHttpServer())
      .post('/api/pets')
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .send({ name: 'No Gender Cat', species: 'Cat' })
      .expect(400);
  });

  it('rejects a dating profile for a species other than cat/dog', async () => {
    const parrotRes = await request(app.getHttpServer())
      .post('/api/pets')
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .send({ name: 'Polly', species: 'Parrot', gender: 'MALE' })
      .expect(201);
    const parrotId = data<{ _id: string }>(parrotRes)._id;

    await request(app.getHttpServer())
      .post(`/api/pets/${parrotId}/dating-profile`)
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .send({ modes: ['PLAYDATE'], photos: DATING_PHOTOS })
      .expect(400);
  });

  it('both owners create a PLAYDATE+BREEDING dating profile for their cat', async () => {
    await request(app.getHttpServer())
      .post(`/api/pets/${petAId}/dating-profile`)
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .send({
        modes: ['PLAYDATE', 'BREEDING'],
        bio: 'Loves chasing string.',
        likes: ['string toys'],
        dislikes: ['baths'],
        photos: DATING_PHOTOS,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/pets/${petBId}/dating-profile`)
      .set('Authorization', `Bearer ${ownerBAccessToken}`)
      .send({
        modes: ['PLAYDATE', 'BREEDING'],
        bio: 'Enjoys sunny windowsills.',
        photos: DATING_PHOTOS,
      })
      .expect(201);
  });

  it('rejects creating a second profile for the same pet', async () => {
    await request(app.getHttpServer())
      .post(`/api/pets/${petAId}/dating-profile`)
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .send({ modes: ['PLAYDATE'], photos: DATING_PHOTOS })
      .expect(400);
  });

  it("owner A discovers owner B's cat as a PLAYDATE candidate", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dating/discover')
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .query({ petId: petAId, mode: 'PLAYDATE' })
      .expect(200);

    const page = data<{
      profiles: Array<{ petId: { _id: string; name: string } }>;
    }>(res);
    const candidateIds = page.profiles.map((p) => p.petId._id);

    expect(candidateIds).toContain(petBId);
  });

  describe('mode split — BREEDING is species-restricted, PLAYDATE is not', () => {
    let dogId: string;

    it('owner A adds a dog and enables it for both modes', async () => {
      const dogRes = await request(app.getHttpServer())
        .post('/api/pets')
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .send({ name: 'Dating Dog A', species: 'Dog', gender: 'MALE' })
        .expect(201);
      dogId = data<{ _id: string }>(dogRes)._id;

      await request(app.getHttpServer())
        .post(`/api/pets/${dogId}/dating-profile`)
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .send({ modes: ['PLAYDATE', 'BREEDING'], photos: DATING_PHOTOS })
        .expect(201);
    });

    it("the dog never appears in owner B's cat's BREEDING pool", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dating/discover')
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .query({ petId: petBId, mode: 'BREEDING' })
        .expect(200);

      const page = data<{ profiles: Array<{ petId: { _id: string } }> }>(res);
      const candidateIds = page.profiles.map((p) => p.petId._id);

      expect(candidateIds).not.toContain(dogId);
    });

    it("the dog DOES appear in owner B's cat's PLAYDATE pool", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dating/discover')
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .query({ petId: petBId, mode: 'PLAYDATE' })
        .expect(200);

      const page = data<{ profiles: Array<{ petId: { _id: string } }> }>(res);
      const candidateIds = page.profiles.map((p) => p.petId._id);

      expect(candidateIds).toContain(dogId);
    });

    it('a BREEDING swipe across species is rejected server-side', async () => {
      await request(app.getHttpServer())
        .post('/api/dating/swipe')
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .send({
          fromPetId: petBId,
          toPetId: dogId,
          action: 'LIKE',
          mode: 'BREEDING',
        })
        .expect(400);
    });
  });

  describe('BREEDING mode is strictly opposite-gender', () => {
    let sameGenderCatId: string;

    it('owner B adds a second, same-gender (MALE) cat enabled for BREEDING', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/pets')
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .send({ name: 'Dating Cat B2', species: 'Cat', gender: 'MALE' })
        .expect(201);
      sameGenderCatId = data<{ _id: string }>(res)._id;

      await request(app.getHttpServer())
        .post(`/api/pets/${sameGenderCatId}/dating-profile`)
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .send({ modes: ['BREEDING'], photos: DATING_PHOTOS })
        .expect(201);
    });

    it("owner A's (MALE) cat never sees the same-gender cat in its BREEDING pool", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dating/discover')
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .query({ petId: petAId, mode: 'BREEDING' })
        .expect(200);

      const page = data<{ profiles: Array<{ petId: { _id: string } }> }>(res);
      const candidateIds = page.profiles.map((p) => p.petId._id);

      expect(candidateIds).not.toContain(sameGenderCatId);
      // The opposite-gender cat B (FEMALE), same species, is still there.
      expect(candidateIds).toContain(petBId);
    });

    it('a same-gender BREEDING swipe is rejected server-side, even called directly (not via discover)', async () => {
      await request(app.getHttpServer())
        .post('/api/dating/swipe')
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .send({
          fromPetId: petAId,
          toPetId: sameGenderCatId,
          action: 'LIKE',
          mode: 'BREEDING',
        })
        .expect(400);
    });
  });

  describe('two pets owned by the same person can never match each other', () => {
    let secondCatOwnedByA: string;

    it('owner A adds a second cat, opposite-gender to the first, enabled for both modes', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/pets')
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .send({ name: 'Dating Cat A2', species: 'Cat', gender: 'FEMALE' })
        .expect(201);
      secondCatOwnedByA = data<{ _id: string }>(res)._id;

      await request(app.getHttpServer())
        .post(`/api/pets/${secondCatOwnedByA}/dating-profile`)
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .send({ modes: ['PLAYDATE', 'BREEDING'], photos: DATING_PHOTOS })
        .expect(201);
    });

    it("owner A's two pets never see each other in discovery", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dating/discover')
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .query({ petId: petAId, mode: 'PLAYDATE' })
        .expect(200);

      const page = data<{ profiles: Array<{ petId: { _id: string } }> }>(res);
      const candidateIds = page.profiles.map((p) => p.petId._id);

      expect(candidateIds).not.toContain(secondCatOwnedByA);
    });

    it('swiping directly between two same-owner pets is rejected, even though genders/species/mode are otherwise compatible', async () => {
      await request(app.getHttpServer())
        .post('/api/dating/swipe')
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .send({
          fromPetId: petAId,
          toPetId: secondCatOwnedByA,
          action: 'LIKE',
          mode: 'BREEDING',
        })
        .expect(400);
    });
  });

  it('owner A swiping LIKE on owner B alone (PLAYDATE) does not yet create a match', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/dating/swipe')
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .send({
        fromPetId: petAId,
        toPetId: petBId,
        action: 'LIKE',
        mode: 'PLAYDATE',
      })
      .expect(201);

    expect(data<{ match: unknown }>(res).match).toBeNull();
  });

  it('swiping the same pet twice in the same mode is rejected', async () => {
    await request(app.getHttpServer())
      .post('/api/dating/swipe')
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .send({
        fromPetId: petAId,
        toPetId: petBId,
        action: 'LIKE',
        mode: 'PLAYDATE',
      })
      .expect(400);
  });

  it('a mutual LIKE (same mode) from owner B creates a Match immediately', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/dating/swipe')
      .set('Authorization', `Bearer ${ownerBAccessToken}`)
      .send({
        fromPetId: petBId,
        toPetId: petAId,
        action: 'LIKE',
        mode: 'PLAYDATE',
      })
      .expect(201);

    const match = data<{ match: { _id: string; status: string } | null }>(
      res,
    ).match;
    expect(match).not.toBeNull();
    expect(match!.status).toBe('ACTIVE');
    matchId = match!._id;
  });

  it('the match now shows up for both owners, with the originating mode attached', async () => {
    const resA = await request(app.getHttpServer())
      .get('/api/dating/matches')
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/api/dating/matches')
      .set('Authorization', `Bearer ${ownerBAccessToken}`)
      .expect(200);

    const matchesA = data<Array<{ _id: string; mode: string }>>(resA);
    const matchesB = data<Array<{ _id: string; mode: string }>>(resB);

    expect(
      matchesA.some((m) => m._id === matchId && m.mode === 'PLAYDATE'),
    ).toBe(true);
    expect(matchesB.some((m) => m._id === matchId)).toBe(true);
  });

  it('a third, unrelated user cannot see or message the match', async () => {
    const intruder = await registerAndVerify(
      'Dating Intruder',
      `dating-intruder-${runId}@example.com`,
    );

    await request(app.getHttpServer())
      .get(`/api/dating/matches/${matchId}/messages`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(404);
  });

  it('owner A sends a message and owner B can read it', async () => {
    await request(app.getHttpServer())
      .post(`/api/dating/matches/${matchId}/messages`)
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .send({ content: "Milo's cat would love a playdate!" })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/dating/matches/${matchId}/messages`)
      .set('Authorization', `Bearer ${ownerBAccessToken}`)
      .expect(200);

    const messages = data<Array<{ content: string }>>(res);
    expect(messages.some((m) => m.content.includes('playdate'))).toBe(true);
  });

  // Dedicated Dating -> Match & Chats unread system (see
  // PAWTATO_FRONTEND_BLUEPRINT.md's "Dating Chat Notifications" contract):
  // entirely separate storage/API from the general Notifications system,
  // covering pet-to-pet identification, authorization, multi-message
  // conversations, and the read/delete semantics.
  describe('dating chat notifications (dedicated unread system, Phase 14)', () => {
    async function unreadSummary(token: string) {
      const res = await request(app.getHttpServer())
        .get('/api/dating/notifications/unread-summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      return data<{ totalUnread: number; matchChatsUnread: number }>(res);
    }

    it("owner B has one unread dating-chat notification, correctly attributed to owner A's cat", async () => {
      const summary = await pollUntil(
        () => unreadSummary(ownerBAccessToken),
        (s) => s.totalUnread >= 1,
      );

      expect(summary.matchChatsUnread).toBe(summary.totalUnread);

      const listRes = await request(app.getHttpServer())
        .get('/api/dating/notifications')
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .expect(200);

      const conversations = data<
        Array<{
          matchId: string;
          senderPetId: string;
          senderPetName: string;
          recipientPetId: string;
          unreadCount: number;
        }>
      >(listRes);

      const thisMatch = conversations.find((c) => c.matchId === matchId);
      expect(thisMatch).toBeDefined();
      // Correct pet-to-pet identification: the sender is owner A's cat (the
      // one that actually sent the message), the recipient is owner B's cat
      // — not just "owner A" and "owner B" at the account level.
      expect(thisMatch!.senderPetId).toBe(petAId);
      expect(thisMatch!.senderPetName).toBe('Dating Cat A');
      expect(thisMatch!.recipientPetId).toBe(petBId);
    });

    it('owner A (the sender) has no unread dating-chat notifications of their own', async () => {
      const summary = await unreadSummary(ownerAAccessToken);
      expect(summary.totalUnread).toBe(0);
    });

    it('a third, unrelated user sees no unread dating-chat notifications, and cannot mark this conversation read', async () => {
      // Reuses the already-registered admin account as "some other user
      // entirely unrelated to this match" — avoids burning another slot in
      // the register endpoint's 5/min throttle window (see the dedicated
      // intruder registrations already spent elsewhere in this file).
      const summary = await unreadSummary(adminAccessToken);
      expect(summary.totalUnread).toBe(0);

      await request(app.getHttpServer())
        .post(`/api/dating/matches/${matchId}/read`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);
    });

    it('opening the chat deletes the notification permanently — not a soft IsRead flag', async () => {
      await pollUntil(
        () => unreadSummary(ownerBAccessToken),
        (s) => s.totalUnread >= 1,
      );

      const readRes = await request(app.getHttpServer())
        .post(`/api/dating/matches/${matchId}/read`)
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .expect(201);

      expect(data<{ deletedCount: number }>(readRes).deletedCount).toBe(1);

      const summary = await unreadSummary(ownerBAccessToken);
      expect(summary.totalUnread).toBe(0);

      const listRes = await request(app.getHttpServer())
        .get('/api/dating/notifications')
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .expect(200);
      expect(data<Array<unknown>>(listRes)).toEqual([]);
    });

    it('re-reading an already-clear conversation is a harmless no-op', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/dating/matches/${matchId}/read`)
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .expect(201);

      expect(data<{ deletedCount: number }>(res).deletedCount).toBe(0);
    });

    it('three messages in one conversation collapse into a single chat entry with unreadCount 3, and one read call clears all three', async () => {
      for (const content of [
        'Unread message 1',
        'Unread message 2',
        'Unread message 3',
      ]) {
        await request(app.getHttpServer())
          .post(`/api/dating/matches/${matchId}/messages`)
          .set('Authorization', `Bearer ${ownerAAccessToken}`)
          .send({ content })
          .expect(201);
      }

      const summary = await pollUntil(
        () => unreadSummary(ownerBAccessToken),
        (s) => s.totalUnread >= 3,
      );
      expect(summary.totalUnread).toBe(3);

      const listRes = await request(app.getHttpServer())
        .get('/api/dating/notifications')
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .expect(200);
      const conversations =
        data<Array<{ matchId: string; unreadCount: number }>>(listRes);
      expect(
        conversations.find((c) => c.matchId === matchId)?.unreadCount,
      ).toBe(3);

      // A single mark-as-read call clears all three — the frontend never
      // needs one API call per unread message.
      const readRes = await request(app.getHttpServer())
        .post(`/api/dating/matches/${matchId}/read`)
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .expect(201);
      expect(data<{ deletedCount: number }>(readRes).deletedCount).toBe(3);

      const clearedSummary = await unreadSummary(ownerBAccessToken);
      expect(clearedSummary.totalUnread).toBe(0);
    });

    it('a message sent over the socket also produces a dedicated dating-chat notification', async () => {
      const socketA = await connectSocket(ownerAAccessToken);
      socketA.emit('sendMessage', { matchId, content: 'Sent live!' });

      const summary = await pollUntil(
        () => unreadSummary(ownerBAccessToken),
        (s) => s.totalUnread >= 1,
      );
      expect(summary.totalUnread).toBe(1);

      await request(app.getHttpServer())
        .post(`/api/dating/matches/${matchId}/read`)
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .expect(201);

      socketA.close();
    });

    it('this dedicated system never appears in, or is affected by, the general Notifications API', async () => {
      await request(app.getHttpServer())
        .post(`/api/dating/matches/${matchId}/messages`)
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .send({ content: 'Should never surface as a general notification' })
        .expect(201);

      await pollUntil(
        () => unreadSummary(ownerBAccessToken),
        (s) => s.totalUnread >= 1,
      );

      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .query({ limit: 200 })
        .expect(200);

      const notifications = data<{
        notifications: Array<{ type: string; message: string }>;
      }>(res).notifications;

      expect(
        notifications.some((n) =>
          n.message.includes('Should never surface as a general notification'),
        ),
      ).toBe(false);
      expect(notifications.every((n) => n.type !== 'dating.message-sent')).toBe(
        true,
      );

      // Drain the unread state so later assertions in this file (e.g. the
      // deactivation/unmatch/delete sections below) start from a clean slate.
      await request(app.getHttpServer())
        .post(`/api/dating/matches/${matchId}/read`)
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .expect(201);
    });
  });

  describe('real-time chat over the Socket.IO gateway (Phase 12)', () => {
    it('a socket with no token is rejected', async () => {
      const socket = io(socketBaseUrl, {
        transports: ['websocket'],
        forceNew: true,
      });

      await new Promise<void>((resolve) => {
        socket.once('disconnect', () => resolve());
        socket.once('connect_error', () => resolve());
      });

      expect(socket.connected).toBe(false);
      socket.close();
    });

    it('a message sent over the socket is broadcast live to the other side, and persists to the REST history', async () => {
      const socketA = await connectSocket(ownerAAccessToken);
      const socketB = await connectSocket(ownerBAccessToken);

      socketB.emit('joinMatch', { matchId });
      await waitForEvent(socketB, 'joinedMatch');

      const newMessagePromise = waitForEvent<{
        matchId: string;
        content: string;
      }>(socketB, 'newMessage');

      socketA.emit('sendMessage', {
        matchId,
        content: 'Sent live over the socket!',
      });

      const received = await newMessagePromise;
      expect(received.matchId).toBe(matchId);
      expect(received.content).toBe('Sent live over the socket!');

      const res = await request(app.getHttpServer())
        .get(`/api/dating/matches/${matchId}/messages`)
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .expect(200);

      const messages = data<Array<{ content: string }>>(res);
      expect(
        messages.some((m) => m.content === 'Sent live over the socket!'),
      ).toBe(true);

      socketA.close();
      socketB.close();
    });

    it('a typing indicator reaches the other side but not the sender', async () => {
      const socketA = await connectSocket(ownerAAccessToken);
      const socketB = await connectSocket(ownerBAccessToken);

      socketA.emit('joinMatch', { matchId });
      socketB.emit('joinMatch', { matchId });
      await waitForEvent(socketA, 'joinedMatch');
      await waitForEvent(socketB, 'joinedMatch');

      const typingPromise = waitForEvent<{ matchId: string }>(
        socketB,
        'typing',
      );
      socketA.emit('typing', { matchId });

      const typingEvent = await typingPromise;
      expect(typingEvent.matchId).toBe(matchId);

      socketA.close();
      socketB.close();
    });

    it("a socket cannot join a match it doesn't own a side of", async () => {
      const intruder = await registerAndVerify(
        'Socket Intruder',
        `dating-socket-intruder-${runId}@example.com`,
      );
      const socket = await connectSocket(intruder.accessToken);

      const errorPromise = waitForEvent<{ message: string }>(socket, 'error');
      socket.emit('joinMatch', { matchId });

      const error = await errorPromise;
      expect(error.message).toBe('Match not found');

      socket.close();
    });
  });

  describe('identity verification + explicit per-match NID sharing (Phase 11)', () => {
    it('viewing NID exchange before either side is verified is rejected', async () => {
      await request(app.getHttpServer())
        .get(`/api/dating/matches/${matchId}/nid`)
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .expect(400);
    });

    it('both owners submit identity verification and land in PENDING', async () => {
      for (const token of [ownerAAccessToken, ownerBAccessToken]) {
        await request(app.getHttpServer())
          .post('/api/dating/verification')
          .set('Authorization', `Bearer ${token}`)
          .attach('front', ONE_PIXEL_PNG, {
            filename: 'front.png',
            contentType: 'image/png',
          })
          .attach('back', ONE_PIXEL_PNG, {
            filename: 'back.png',
            contentType: 'image/png',
          })
          .expect(201);

        const statusRes = await request(app.getHttpServer())
          .get('/api/dating/verification/me')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(data<{ status: string }>(statusRes).status).toBe('PENDING');
      }
    });

    it('a non-admin cannot see the verification queue', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/dating/verifications')
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .expect(403);
    });

    let ownerAVerificationId: string;
    let ownerBVerificationId: string;

    it('admin sees both submissions pending, and can fetch signed review images', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/dating/verifications')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ status: 'PENDING' })
        .expect(200);

      const page = data<{
        verifications: Array<{ _id: string; userId: { email: string } }>;
      }>(res);

      const ownerAEntry = page.verifications.find(
        (v) => v.userId?.email === ownerAEmail,
      );
      const ownerBEntry = page.verifications.find(
        (v) => v.userId?.email === ownerBEmail,
      );
      expect(ownerAEntry).toBeDefined();
      expect(ownerBEntry).toBeDefined();
      ownerAVerificationId = ownerAEntry!._id;
      ownerBVerificationId = ownerBEntry!._id;

      const imagesRes = await request(app.getHttpServer())
        .get(`/api/admin/dating/verifications/${ownerAVerificationId}/images`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      const images = data<{ frontUrl: string; backUrl: string }>(imagesRes);
      expect(images.frontUrl).toContain('/api/storage/private/');
      expect(images.backUrl).toContain('/api/storage/private/');
    });

    it('admin approves both submissions', async () => {
      for (const id of [
        () => ownerAVerificationId,
        () => ownerBVerificationId,
      ]) {
        const res = await request(app.getHttpServer())
          .patch(`/api/admin/dating/verifications/${id()}/approve`)
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(200);

        expect(data<{ status: string }>(res).status).toBe('APPROVED');
      }
    });

    it('viewing NID exchange still fails until the other side shares', async () => {
      await request(app.getHttpServer())
        .get(`/api/dating/matches/${matchId}/nid`)
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .expect(400);
    });

    it('owner B shares, owner A can then view a signed URL to it', async () => {
      await request(app.getHttpServer())
        .post(`/api/dating/matches/${matchId}/share-nid`)
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/dating/matches/${matchId}/nid`)
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .expect(200);

      const urls = data<{ frontUrl: string; backUrl: string }>(res);
      expect(urls.frontUrl).toContain('/api/storage/private/');

      // The signed URL itself is fetchable — proves the private file is
      // real and the token-gated route actually serves it, not just that
      // the URL was constructed.
      const path = urls.frontUrl.replace(/^https?:\/\/[^/]+/, '');
      await request(app.getHttpServer()).get(path).expect(200);
    });

    it("owner B still cannot view owner A's NID (sharing is one-directional until A also shares)", async () => {
      await request(app.getHttpServer())
        .get(`/api/dating/matches/${matchId}/nid`)
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .expect(400);
    });

    it('a stale/invalid storage token is rejected, not silently served', async () => {
      await request(app.getHttpServer())
        .get('/api/storage/private/not-a-real-token')
        .expect(404);
    });
  });

  it("owner B reports owner A's pet profile", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/dating/report')
      .set('Authorization', `Bearer ${ownerBAccessToken}`)
      .send({ targetPetId: petAId, reason: 'Suspicious profile photos.' })
      .expect(201);

    expect(data<{ message: string }>(res).message).toBeDefined();
  });

  it('admin sees the report in the moderation queue, PENDING by default', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/dating/reports')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .query({ status: 'PENDING' })
      .expect(200);

    const page = data<{
      reports: Array<{ _id: string; status: string; targetPetId: unknown }>;
    }>(res);
    expect(page.reports.length).toBeGreaterThan(0);
    reportId = page.reports[0]._id;
  });

  it('a non-admin cannot see the dating moderation queue', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/dating/reports')
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .expect(403);
  });

  it('admin actions the report and deactivates the reported profile', async () => {
    const statusRes = await request(app.getHttpServer())
      .patch(`/api/admin/dating/reports/${reportId}/status`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ status: 'ACTIONED' })
      .expect(200);
    expect(data<{ status: string }>(statusRes).status).toBe('ACTIONED');

    const deactivateRes = await request(app.getHttpServer())
      .patch(`/api/admin/dating/profiles/${petAId}/deactivate`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(data<{ isActive: boolean }>(deactivateRes).isActive).toBe(false);
  });

  it('the deactivated pet no longer appears in discovery', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dating/discover')
      .set('Authorization', `Bearer ${ownerBAccessToken}`)
      .query({ petId: petBId, mode: 'PLAYDATE' })
      .expect(200);

    const page = data<{ profiles: Array<{ petId: { _id: string } }> }>(res);
    const candidateIds = page.profiles.map((p) => p.petId._id);

    expect(candidateIds).not.toContain(petAId);
  });

  it('the existing match and its messages are unaffected by the deactivation', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/dating/matches/${matchId}/messages`)
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .expect(200);

    expect(data<Array<unknown>>(res).length).toBeGreaterThan(0);
  });

  it('cannot delete a conversation that is still active — unmatch first', async () => {
    await request(app.getHttpServer())
      .post(`/api/dating/matches/${matchId}/delete`)
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .expect(400);
  });

  it('either side can unmatch, and a message can no longer be sent afterward', async () => {
    await request(app.getHttpServer())
      .post(`/api/dating/matches/${matchId}/unmatch`)
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/dating/matches/${matchId}/messages`)
      .set('Authorization', `Bearer ${ownerBAccessToken}`)
      .send({ content: 'Are you still there?' })
      .expect(400);
  });

  it('the archived match still shows up (read-only) in both matches lists', async () => {
    const resA = await request(app.getHttpServer())
      .get('/api/dating/matches')
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .expect(200);

    const matchesA = data<Array<{ _id: string; status: string }>>(resA);
    const archived = matchesA.find((m) => m._id === matchId);
    expect(archived).toBeDefined();
    expect(archived!.status).toBe('UNMATCHED');
  });

  describe('deleting the archived conversation (Phase 12)', () => {
    it("owner A deletes it; it disappears from A's list but stays in B's", async () => {
      await request(app.getHttpServer())
        .post(`/api/dating/matches/${matchId}/delete`)
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .expect(201);

      const resA = await request(app.getHttpServer())
        .get('/api/dating/matches')
        .set('Authorization', `Bearer ${ownerAAccessToken}`)
        .expect(200);
      const matchesA = data<Array<{ _id: string }>>(resA);
      expect(matchesA.some((m) => m._id === matchId)).toBe(false);

      const resB = await request(app.getHttpServer())
        .get('/api/dating/matches')
        .set('Authorization', `Bearer ${ownerBAccessToken}`)
        .expect(200);
      const matchesB = data<Array<{ _id: string }>>(resB);
      expect(matchesB.some((m) => m._id === matchId)).toBe(true);
    });
  });

  let chatReportId: string;

  it('owner B reports the conversation itself (not just the profile), attaching chat context', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/dating/report')
      .set('Authorization', `Bearer ${ownerBAccessToken}`)
      .send({
        targetPetId: petAId,
        reason: 'Harassment in chat messages.',
        matchId,
      })
      .expect(201);

    expect(data<{ message: string }>(res).message).toBeDefined();
  });

  it('a report cannot attach a matchId whose other side is not the named targetPetId', async () => {
    await request(app.getHttpServer())
      .post('/api/dating/report')
      .set('Authorization', `Bearer ${ownerBAccessToken}`)
      .send({
        targetPetId: petBId, // owner B's own pet, not the other side of the match
        reason: 'Bogus context.',
        matchId,
      })
      .expect(400);
  });

  it('admin can view the reported conversation on demand', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/api/admin/dating/reports')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .query({ limit: 100 })
      .expect(200);

    const page = data<{
      reports: Array<{ _id: string; matchId: string | null; reason: string }>;
    }>(listRes);
    const chatReport = page.reports.find(
      (r) => r.reason === 'Harassment in chat messages.',
    );
    expect(chatReport).toBeDefined();
    expect(chatReport!.matchId).toBeTruthy();
    chatReportId = chatReport!._id;

    const messagesRes = await request(app.getHttpServer())
      .get(`/api/admin/dating/reports/${chatReportId}/messages`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    const messages = data<Array<{ content: string }>>(messagesRes);
    expect(messages.length).toBeGreaterThan(0);
  });

  it('a report filed without a matchId has no conversation to show admin', async () => {
    await request(app.getHttpServer())
      .get(`/api/admin/dating/reports/${reportId}/messages`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(400);
  });

  it('every dating action taken above is recorded in the audit log', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/activity')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .query({ limit: 200 })
      .expect(200);

    const page = data<{ activities: Array<{ action: string }> }>(res);
    const actions = page.activities.map((entry) => entry.action);

    expect(actions).toEqual(
      expect.arrayContaining([
        'dating.report.created',
        'dating.report.status-changed',
        'admin.dating-profile.deactivated',
        'dating.identity-verification.approved',
        'dating.nid.shared',
        'dating.nid.viewed',
        'dating.chat.viewed',
      ]),
    );
  });
});
