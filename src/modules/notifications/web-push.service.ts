import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';

// Thin wrapper around the `web-push` SDK — PushChannel talks to Web Push
// only through this, never the SDK directly, matching the same
// single-boundary pattern StripeService established for the `stripe` SDK
// (see tag-orders/stripe.service.ts): keeps the provider swappable and lets
// e2e specs override this one injectable instead of jest.mock-ing a module.
@Injectable()
export class WebPushService {
  private configured = false;

  constructor(private readonly configService: ConfigService) {
    const publicKey = this.configService.get<string>('vapid.publicKey');
    const privateKey = this.configService.get<string>('vapid.privateKey');
    const subject = this.configService.get<string>('vapid.subject');

    if (publicKey && privateKey && subject) {
      webPush.setVapidDetails(subject, publicKey, privateKey);
      this.configured = true;
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async send(
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    },
    payload: string,
  ): Promise<void> {
    await webPush.sendNotification(subscription, payload);
  }

  // True when the push service reports a subscription as gone (404/410) —
  // the browser unsubscribed, cleared site data, or it expired.
  isGoneError(error: unknown): boolean {
    return (
      error instanceof webPush.WebPushError &&
      (error.statusCode === 404 || error.statusCode === 410)
    );
  }
}
