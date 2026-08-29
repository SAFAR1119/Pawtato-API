import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

// Thin wrapper around the Stripe SDK — every other file in this module talks
// to this, never to `stripe` directly, so the real provider stays swappable
// and easy to mock in tests. Both STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET are
// optional at boot (see env.validation.ts) — this feature is additive and
// shouldn't block the rest of the API from starting, so the client is built
// lazily and throws a clear 503 the first time it's actually needed without
// a key configured, rather than crashing on boot.
@Injectable()
export class StripeService {
  private client: Stripe | undefined;

  constructor(private readonly configService: ConfigService) {}

  private getClient(): Stripe {
    if (this.client) {
      return this.client;
    }

    const secretKey = this.configService.get<string>('stripe.secretKey');

    if (!secretKey) {
      throw new ServiceUnavailableException(
        'Tag ordering is not configured on this server (missing STRIPE_SECRET_KEY).',
      );
    }

    this.client = new Stripe(secretKey);

    return this.client;
  }

  async createCheckoutSession(order: {
    orderId: string;
    quantity: number;
    unitPriceCents: number;
    currency: string;
  }): Promise<Stripe.Checkout.Session> {
    const frontendUrl = this.configService.get<string>('app.frontendUrl');

    return this.getClient().checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: order.currency,
            unit_amount: order.unitPriceCents,
            product_data: {
              name: 'Pawtato QR pet tag',
            },
          },
          quantity: order.quantity,
        },
      ],
      metadata: { orderId: order.orderId },
      success_url: `${frontendUrl}/tag-orders/${order.orderId}?status=success`,
      cancel_url: `${frontendUrl}/tag-orders/${order.orderId}?status=cancelled`,
    });
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.configService.get<string>(
      'stripe.webhookSecret',
    );

    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        'Tag order webhooks are not configured on this server (missing STRIPE_WEBHOOK_SECRET).',
      );
    }

    return this.getClient().webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  }

  extractPaymentIntentId(session: Stripe.Checkout.Session): string | undefined {
    return typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  }
}
