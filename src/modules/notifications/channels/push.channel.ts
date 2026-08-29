import { Injectable, Logger } from '@nestjs/common';

import { NotificationChannel } from '../interfaces/notification-channel.interface';
import { NotificationsService } from '../notifications.service';
import { WebPushService } from '../web-push.service';
import { renderNotification } from '../templates/notification-templates';
import { DevicePlatform } from '../../../common/enums/device-platform.enum';

interface WebPushTarget {
  endpoint: string;
  p256dh: string;
  authSecret: string;
}

// Real Web Push (VAPID) delivery for WEB subscriptions, via WebPushService
// (the module's sole boundary to the `web-push` SDK). IOS/ANDROID rows
// exist in storage (see RegisterDeviceTokenDto) but there's no FCM/APNs
// provider wired up yet — mobile apps are still Phase 9 backlog — so this
// channel silently skips them; wiring a native provider later is a change
// to this one file, not to anything that calls it.
@Injectable()
export class PushChannel implements NotificationChannel {
  private readonly logger = new Logger(PushChannel.name);
  private vapidWarningLogged = false;

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly webPushService: WebPushService,
  ) {}

  async send(
    userId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { title, message, sendPush } = renderNotification(type, payload);

    if (!sendPush) {
      return;
    }

    if (!this.webPushService.isConfigured()) {
      if (!this.vapidWarningLogged) {
        this.logger.warn(
          'Push notifications are not configured (missing VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT) — skipping send.',
        );
        this.vapidWarningLogged = true;
      }
      return;
    }

    try {
      const deviceTokens =
        await this.notificationsService.getDeviceTokens(userId);

      const webSubscriptions: WebPushTarget[] = deviceTokens
        .filter(
          (device) =>
            device.platform === DevicePlatform.WEB &&
            typeof device.endpoint === 'string' &&
            typeof device.p256dh === 'string' &&
            typeof device.authSecret === 'string',
        )
        .map((device) => ({
          endpoint: device.endpoint as string,
          p256dh: device.p256dh as string,
          authSecret: device.authSecret as string,
        }));

      if (webSubscriptions.length === 0) {
        return;
      }

      const notificationPayload = JSON.stringify({
        title,
        body: message,
        tag: type,
        data: {
          type,
          ...(typeof payload.petId === 'string'
            ? { petId: payload.petId }
            : {}),
        },
      });

      await Promise.all(
        webSubscriptions.map((device) =>
          this.sendToSubscription(device, notificationPayload),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Failed to send push for event "${type}" to user ${userId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async sendToSubscription(
    device: WebPushTarget,
    notificationPayload: string,
  ): Promise<void> {
    try {
      await this.webPushService.send(
        {
          endpoint: device.endpoint,
          keys: {
            p256dh: device.p256dh,
            auth: device.authSecret,
          },
        },
        notificationPayload,
      );
    } catch (error) {
      // 404/410 means the push service considers this subscription gone
      // (browser unsubscribed, cleared site data, or it expired) — clean it
      // up rather than retrying it forever on every future event.
      if (this.webPushService.isGoneError(error)) {
        await this.notificationsService.removeDeviceTokenByEndpoint(
          device.endpoint,
        );
        return;
      }

      this.logger.error(
        `Web push delivery failed for endpoint ${device.endpoint}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
