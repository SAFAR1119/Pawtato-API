import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { MailerService } from '@nestjs-modules/mailer';
import { Model, Types } from 'mongoose';

import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';
import {
  DeviceToken,
  DeviceTokenDocument,
} from './schemas/device-token.schema';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { RegisterWebPushSubscriptionDto } from './dto/register-web-push-subscription.dto';
import { DevicePlatform } from '../../common/enums/device-platform.enum';
import { renderPlainTextTemplate } from '../../mail/mail-template.util';
import { NotificationPriority } from './enums/notification-priority.enum';
import {
  resolveExpiresAt,
  resolvePriority,
} from './utils/notification-priority.util';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly mailerService: MailerService,

    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,

    @InjectModel(DeviceToken.name)
    private readonly deviceTokenModel: Model<DeviceTokenDocument>,
  ) {}

  async sendEmail(to: string, subject: string, message: string) {
    await this.mailerService.sendMail({
      to,
      subject,
      html: `
        <h2>${subject}</h2>

        <p>${message}</p>

        <hr>

        <small>
          Pawtato Pet Management System
        </small>
      `,
    });

    return true;
  }

  // Renders a named .hbs template (via MailerModule's HandlebarsAdapter) for
  // the HTML body, plus its .txt sibling for the plain-text alternative —
  // used by the auth flows (verify-email, forgot-password, password-reset).
  async sendTemplateEmail(
    to: string,
    subject: string,
    template: string,
    context: Record<string, unknown>,
  ) {
    await this.mailerService.sendMail({
      to,
      subject,
      template,
      context,
      text: renderPlainTextTemplate(template, context),
    });

    return true;
  }

  async create(
    userId: string,
    type: string,
    title: string,
    message: string,
    data?: Record<string, unknown>,
  ) {
    const isLost = data?.isLost === true;
    const priority = resolvePriority(type, isLost);
    const expiresAt = resolveExpiresAt(priority);

    const petId =
      typeof data?.petId === 'string' ? new Types.ObjectId(data.petId) : null;

    return this.notificationModel.create({
      user: new Types.ObjectId(userId),
      pet: petId,
      type,
      title,
      message,
      data,
      priority,
      expiresAt,
    });
  }

  async findForUser(userId: string, query: NotificationQueryDto) {
    const { page, limit, unreadOnly, type } = query;

    const filter: { user: Types.ObjectId; readAt?: null; type?: string } = {
      user: new Types.ObjectId(userId),
    };

    if (unreadOnly) {
      filter.readAt = null;
    }

    if (type) {
      filter.type = type;
    }

    const total = await this.notificationModel.countDocuments(filter);

    const notifications = await this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      notifications,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.notificationModel.findOneAndUpdate(
      { _id: notificationId, user: new Types.ObjectId(userId) },
      { readAt: new Date() },
      { new: true },
    );

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  // Read state never affects lifetime — this only stamps readAt on whatever
  // is currently unread. Auto-expiry keeps running independently.
  async markAllRead(userId: string) {
    const result = await this.notificationModel.updateMany(
      { user: new Types.ObjectId(userId), readAt: null },
      { readAt: new Date() },
    );

    return { updated: result.modifiedCount };
  }

  // Users can delete a notification regardless of its priority — this bypasses
  // expiresAt entirely, it's a direct removal.
  async delete(userId: string, notificationId: string) {
    const result = await this.notificationModel.findOneAndDelete({
      _id: notificationId,
      user: new Types.ObjectId(userId),
    });

    if (!result) {
      throw new NotFoundException('Notification not found');
    }

    return { message: 'Notification deleted' };
  }

  async deleteMany(userId: string, ids: string[]) {
    const result = await this.notificationModel.deleteMany({
      _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
      user: new Types.ObjectId(userId),
    });

    return { deletedCount: result.deletedCount };
  }

  // Cascade delete — every notification belonging to this user, regardless
  // of which pet (if any) it references. Called from AdminService when the
  // user itself is deleted.
  async deleteAllForUser(userId: string) {
    const result = await this.notificationModel.deleteMany({
      user: new Types.ObjectId(userId),
    });

    return { deletedCount: result.deletedCount };
  }

  // Called when a pet is reported found: any CRITICAL (missing-context) scan
  // or found-report notification for that pet is downgraded to STALE_MISSING
  // and given a 1-day expiry, instead of staying pinned forever.
  async resolveMissingContext(userId: string, petId: string) {
    const expiresAt = resolveExpiresAt(NotificationPriority.STALE_MISSING);

    await this.notificationModel.updateMany(
      {
        user: new Types.ObjectId(userId),
        pet: new Types.ObjectId(petId),
        priority: NotificationPriority.CRITICAL,
      },
      { priority: NotificationPriority.STALE_MISSING, expiresAt },
    );
  }

  // Upserts on `token` alone (not `{ userId, token }`) — a token belongs to
  // exactly one device, and if that device is now logged in as a different
  // user (or the same user re-registers after a fresh install), the token
  // should move to point at the current owner rather than create a stale
  // duplicate row for the old one.
  async registerDeviceToken(userId: string, dto: RegisterDeviceTokenDto) {
    return this.deviceTokenModel.findOneAndUpdate(
      { token: dto.token },
      { userId: new Types.ObjectId(userId), platform: dto.platform },
      { upsert: true, new: true },
    );
  }

  async unregisterDeviceToken(userId: string, token: string) {
    const result = await this.deviceTokenModel.findOneAndDelete({
      token,
      userId: new Types.ObjectId(userId),
    });

    if (!result) {
      throw new NotFoundException('Device token not found');
    }

    return { message: 'Device token removed' };
  }

  async getDeviceTokens(userId: string) {
    return this.deviceTokenModel.find({ userId: new Types.ObjectId(userId) });
  }

  // Upserts on `endpoint` alone, for the same reason registerDeviceToken
  // upserts on `token` alone — a subscription belongs to exactly one
  // browser instance, and re-subscribing (re-login, service-worker update)
  // should move it to the current owner rather than duplicate it.
  async registerWebPushSubscription(
    userId: string,
    dto: RegisterWebPushSubscriptionDto,
  ) {
    return this.deviceTokenModel.findOneAndUpdate(
      { endpoint: dto.endpoint },
      {
        userId: new Types.ObjectId(userId),
        platform: DevicePlatform.WEB,
        p256dh: dto.keys.p256dh,
        authSecret: dto.keys.auth,
      },
      { upsert: true, new: true },
    );
  }

  async unregisterWebPushSubscription(userId: string, endpoint: string) {
    const result = await this.deviceTokenModel.findOneAndDelete({
      endpoint,
      userId: new Types.ObjectId(userId),
    });

    if (!result) {
      throw new NotFoundException('Web push subscription not found');
    }

    return { message: 'Web push subscription removed' };
  }

  // Called by PushChannel when a push service reports a subscription as
  // gone (404/410) — the browser unsubscribed, cleared site data, or the
  // subscription expired. Not user-facing, so it's a quiet no-op if the row
  // is already gone rather than throwing (a second concurrent failed send
  // for the same stale subscription shouldn't error).
  async removeDeviceTokenByEndpoint(endpoint: string) {
    await this.deviceTokenModel.deleteOne({ endpoint });
  }
}
