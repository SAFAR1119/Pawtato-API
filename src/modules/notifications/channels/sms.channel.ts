import { Injectable, Logger } from '@nestjs/common';

import { NotificationChannel } from '../interfaces/notification-channel.interface';
import { renderNotification } from '../templates/notification-templates';

// Stub implementation — no SMS provider (Twilio or similar) is configured
// yet. Logs what it would have sent instead of sending it, so the event
// plumbing (payload shape, per-type sendSms flag, ownerPhone population) is
// exercised end-to-end today. Swapping in a real provider later is a change
// to this one file's send() body, not to anything that calls it.
@Injectable()
export class SmsChannel implements NotificationChannel {
  private readonly logger = new Logger(SmsChannel.name);

  // No provider call to await yet (see the stub note above) — kept as a
  // plain function returning Promise.resolve() rather than `async` with no
  // `await`, to satisfy @typescript-eslint/require-await without adding a
  // pointless await.
  send(
    userId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const phone = payload.ownerPhone;

    if (typeof phone !== 'string' || !phone) {
      return Promise.resolve();
    }

    const { message, sendSms } = renderNotification(type, payload);

    if (!sendSms) {
      return Promise.resolve();
    }

    try {
      this.logger.log(
        `[stub] would SMS ${phone} for event "${type}" (user ${userId}): ${message}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send SMS for event "${type}" to user ${userId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return Promise.resolve();
  }
}
