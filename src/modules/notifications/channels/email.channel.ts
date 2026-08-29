import { Injectable, Logger } from '@nestjs/common';

import { NotificationChannel } from '../interfaces/notification-channel.interface';
import { NotificationsService } from '../notifications.service';
import { renderNotification } from '../templates/notification-templates';

@Injectable()
export class EmailChannel implements NotificationChannel {
  private readonly logger = new Logger(EmailChannel.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  async send(
    userId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const to = payload.ownerEmail;

    if (typeof to !== 'string' || !to) {
      return;
    }

    const { title, message, sendEmail } = renderNotification(type, payload);

    if (!sendEmail) {
      return;
    }

    try {
      await this.notificationsService.sendEmail(to, title, message);
    } catch (error) {
      this.logger.error(
        `Failed to send email for event "${type}" to user ${userId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
