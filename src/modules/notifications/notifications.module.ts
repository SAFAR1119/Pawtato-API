import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { MongooseModule } from '@nestjs/mongoose';
import { join } from 'path';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { VaccinationReminderJob } from './jobs/vaccination-reminder.job';
import { NotificationCleanupJob } from './jobs/notification-cleanup.job';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import { DeviceToken, DeviceTokenSchema } from './schemas/device-token.schema';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { PushChannel } from './channels/push.channel';
import { WebPushService } from './web-push.service';
import { DomainEventsListener } from './listeners/domain-events.listener';
import { NOTIFICATION_CHANNELS } from './notifications.constants';
import { NotificationChannel } from './interfaces/notification-channel.interface';

import { VaccinationsModule } from '../vaccinations/vaccinations.module';

@Module({
  imports: [
    VaccinationsModule,

    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: DeviceToken.name, schema: DeviceTokenSchema },
    ]),

    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('mail.host'),
          port: configService.get<number>('mail.port'),
          secure: false,
          auth: {
            user: configService.get<string>('mail.user'),
            pass: configService.get<string>('mail.password'),
          },
        },
        defaults: {
          from: configService.get<string>('mail.from'),
        },
        template: {
          // Copied from src/mail/templates -> dist/mail/templates at build
          // time (see nest-cli.json's compilerOptions.assets); __dirname
          // here resolves to dist/modules/notifications at runtime.
          dir: join(__dirname, '..', '..', 'mail', 'templates'),
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
    }),
  ],

  controllers: [NotificationsController],

  providers: [
    NotificationsService,
    VaccinationReminderJob,
    NotificationCleanupJob,
    EmailChannel,
    SmsChannel,
    PushChannel,
    WebPushService,
    DomainEventsListener,
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (
        email: EmailChannel,
        sms: SmsChannel,
        push: PushChannel,
      ): NotificationChannel[] => [email, sms, push],
      inject: [EmailChannel, SmsChannel, PushChannel],
    },
  ],

  exports: [NotificationsService],
})
export class NotificationsModule {}
