import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  Notification,
  NotificationDocument,
} from '../schemas/notification.schema';

// Deletes any notification whose expiresAt has passed. CRITICAL-priority
// notifications have expiresAt = null and are never touched here — only
// resolveMissingContext() (on pet-found) or a direct user delete removes them.
// Runs every minute so the 10-minute TRANSIENT (routine scan) window is honored closely.
@Injectable()
export class NotificationCleanupJob {
  private readonly logger = new Logger(NotificationCleanupJob.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    const result = await this.notificationModel.deleteMany({
      expiresAt: { $ne: null, $lte: new Date() },
    });

    if (result.deletedCount > 0) {
      this.logger.log(
        `Cleaned up ${result.deletedCount} expired notification(s).`,
      );
    }
  }
}
