import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { MailerService } from '@nestjs-modules/mailer';
import request from 'supertest';
import type { Response } from 'supertest';
import type { App } from 'supertest/types';
import type { Model } from 'mongoose';

import { createTestApp } from './test-app';
import { StripeService } from '../src/modules/tag-orders/stripe.service';
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

// Covers Phase 19 (QR Tag Ordering/Commerce) end-to-end over real HTTP + a
// real DB, with the `stripe` SDK stubbed at the StripeService boundary —
// this module talks to Stripe only through that one wrapper (by design, see
// stripe.service.ts), so overriding it here exercises the entire real
// order/webhook/fulfillment path without needing live Stripe test-mode
// keys. This was flagged as an explicit gap in the Phase 19 roadmap entry:
// "no e2e spec was added ... a future session should decide whether to add
// one with a stubbed Stripe client." A real Stripe test-mode checkout run
// via `stripe listen` is still a separate, manual verification step this
// suite does not (and cannot, without real keys) replace.
describe('Tag ordering & commerce (e2e)', () => {
  let app: INestApplication<App>;
  let userModel: Model<UserDocument>;
  let capturedOtp: string | undefined;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = 'StrongPass123';
  const buyerEmail = `tag-order-buyer-${runId}@example.com`;
  const adminEmail = `tag-order-admin-${runId}@example.com`;

  const fakeSessionId = `cs_test_${runId}`;
  const fakePaymentIntentId = `pi_test_${runId}`;
  let createdOrderId: string | undefined;

  const stripeServiceMock = {
    createCheckoutSession: jest.fn(
      (order: {
        orderId: string;
        quantity: number;
        unitPriceCents: number;
        currency: string;
      }) => {
        createdOrderId = order.orderId;
        return Promise.resolve({
          id: fakeSessionId,
          url: 'https://checkout.stripe.com/test-session',
        });
      },
    ),
    constructWebhookEvent: jest.fn(() => ({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: fakeSessionId,
          metadata: { orderId: createdOrderId },
          payment_intent: fakePaymentIntentId,
        },
      },
    })),
    extractPaymentIntentId: jest.fn(
      (session: { payment_intent?: string }) => session.payment_intent,
    ),
  };

  let buyerAccessToken: string;
  let adminAccessToken: string;

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
      builder
        .overrideProvider(MailerService)
        .useValue(mailerService)
        .overrideProvider(StripeService)
        .useValue(stripeServiceMock),
    );

    userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a buyer and an admin', async () => {
    const buyer = await registerAndVerify('Tag Buyer', buyerEmail);
    buyerAccessToken = buyer.accessToken;

    const admin = await registerAndVerify('Ops Admin', adminEmail);
    await userModel.findByIdAndUpdate(admin.user.id, {
      role: UserRole.ADMIN,
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);

    adminAccessToken = data<{ accessToken: string }>(loginRes).accessToken;
  });

  it('creates a tag order and gets redirected to a Stripe Checkout session', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tag-orders')
      .set('Authorization', `Bearer ${buyerAccessToken}`)
      .send({
        quantity: 3,
        shippingAddress: {
          fullName: 'Tag Buyer',
          line1: 'House 12, Road 5',
          city: 'Dhaka',
          state: 'Dhaka',
          postalCode: '1205',
          country: 'Bangladesh',
        },
      })
      .expect(201);

    const body = data<{ orderId: string; checkoutUrl: string }>(res);
    expect(body.orderId).toEqual(expect.any(String));
    expect(body.checkoutUrl).toBe('https://checkout.stripe.com/test-session');
    expect(stripeServiceMock.createCheckoutSession).toHaveBeenCalledTimes(1);

    createdOrderId = body.orderId;
  });

  it("shows the order as the buyer's own, still pending payment", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/tag-orders/mine')
      .set('Authorization', `Bearer ${buyerAccessToken}`)
      .expect(200);

    const orders = data<Array<{ _id: string; status: string }>>(res);
    const order = orders.find((o) => o._id === createdOrderId);
    expect(order).toBeDefined();
    expect(order?.status).toBe('PENDING_PAYMENT');
  });

  it("rejects marking the order shipped before it's paid", async () => {
    await request(app.getHttpServer())
      .patch(`/api/admin/tag-orders/${createdOrderId}/ship`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ trackingNumber: 'TRACK-TOO-EARLY' })
      .expect(400);
  });

  it('marks the order PAID and mints real Tag inventory via the webhook', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tag-orders/webhook')
      .set('Stripe-Signature', 't=0,v1=fake-signature-verification-is-mocked')
      .send({ id: 'evt_test', type: 'checkout.session.completed' })
      .expect(201);

    expect(data<{ received: boolean }>(res)).toEqual({ received: true });
    expect(stripeServiceMock.constructWebhookEvent).toHaveBeenCalledTimes(1);

    const orderRes = await request(app.getHttpServer())
      .get(`/api/tag-orders/${createdOrderId}`)
      .set('Authorization', `Bearer ${buyerAccessToken}`)
      .expect(200);

    const order = data<{
      status: string;
      stripePaymentIntentId?: string;
    }>(orderRes);
    expect(order.status).toBe('PAID');
    expect(order.stripePaymentIntentId).toBe(fakePaymentIntentId);
  });

  it('is idempotent against Stripe redelivering the same webhook event', async () => {
    await request(app.getHttpServer())
      .post('/api/tag-orders/webhook')
      .set('Stripe-Signature', 't=0,v1=fake-signature-verification-is-mocked')
      .send({ id: 'evt_test', type: 'checkout.session.completed' })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .get(`/api/tag-orders/${createdOrderId}`)
      .set('Authorization', `Bearer ${buyerAccessToken}`)
      .expect(200);

    // Still PAID, not double-processed into some other state — the
    // PENDING_PAYMENT-only guard in handleCheckoutCompleted made the second
    // delivery a no-op.
    expect(data<{ status: string }>(orderRes).status).toBe('PAID');
  });

  it('rejects a webhook call with no signature header', async () => {
    await request(app.getHttpServer())
      .post('/api/tag-orders/webhook')
      .send({ id: 'evt_test', type: 'checkout.session.completed' })
      .expect(400);
  });

  it('the minted tags appear in admin tag inventory, batch-labeled to this order', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/tags')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      // A generous limit: this DB is shared across e2e spec files running in
      // parallel (see test/global-setup.ts), so other suites' own
      // MANUFACTURED tags may also exist — filtering by this order's unique
      // batchLabel below is what actually isolates the assertion.
      .query({ status: 'MANUFACTURED', limit: 200 })
      .expect(200);

    const body = data<{
      tags: Array<{ batchLabel?: string }>;
    }>(res);

    const orderTags = body.tags.filter(
      (tag) => tag.batchLabel === `order-${createdOrderId}`,
    );
    expect(orderTags.length).toBe(3);
  });

  it('an unrelated user cannot read this order', async () => {
    const intruder = await registerAndVerify(
      'Intruder',
      `tag-order-intruder-${runId}@example.com`,
    );

    await request(app.getHttpServer())
      .get(`/api/tag-orders/${createdOrderId}`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(403);
  });

  it('admin marks the now-paid order as shipped', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/tag-orders/${createdOrderId}/ship`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ trackingNumber: 'TRACK-12345' })
      .expect(200);

    const order = data<{ status: string; trackingNumber: string }>(res);
    expect(order.status).toBe('FULFILLED');
    expect(order.trackingNumber).toBe('TRACK-12345');
  });

  it('shows up in the admin tag-orders listing filtered by status', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/tag-orders')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .query({ status: 'FULFILLED' })
      .expect(200);

    const body = data<{ orders: Array<{ _id: string }> }>(res);
    expect(body.orders.some((o) => o._id === createdOrderId)).toBe(true);
  });

  it('a non-admin cannot list or ship tag orders', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/tag-orders')
      .set('Authorization', `Bearer ${buyerAccessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/admin/tag-orders/${createdOrderId}/ship`)
      .set('Authorization', `Bearer ${buyerAccessToken}`)
      .send({ trackingNumber: 'SHOULD-NOT-WORK' })
      .expect(403);
  });
});
