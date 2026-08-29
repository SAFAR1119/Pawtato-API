import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './modules/database/database.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PetsModule } from './modules/pets/pets.module';
import { PublicModule } from './modules/public/public.module';
import { QrModule } from './modules/qr/qr.module';
import { TagsModule } from './modules/tags/tags.module';
import { ScansModule } from './modules/scans/scans.module';
import { FoundReportsModule } from './modules/found-reports/found-reports.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { MedicalModule } from './modules/medical/medical.module';
import { VaccinationsModule } from './modules/vaccinations/vaccinations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminModule } from './modules/admin/admin.module';
import { ActivityModule } from './modules/activity/activity.module';
import { StorageModule } from './modules/storage/storage.module';
import { DatingModule } from './modules/dating/dating.module';
import { CaretakersModule } from './modules/caretakers/caretakers.module';
import { TagOrdersModule } from './modules/tag-orders/tag-orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),

    // Found and fixed while building out Phase 12's dating e2e coverage: with
    // multiple named tiers registered here, @nestjs/throttler's ThrottlerGuard
    // checks EVERY tier against EVERY route on EVERY request, not just the
    // tier(s) named on that route's own @Throttle decorator — a route with no
    // decorator at all still gets checked against 'public'/'write'/'swipe'
    // using each tier's *global* default from this array (see
    // ThrottlerGuard.canActivate(), which iterates `this.throttlers` and
    // falls back to `namedThrottler.limit` whenever no route-level override
    // is found). Before this fix, that meant every undecorated route in the
    // entire app — e.g. POST /pets, which has never had a @Throttle of its
    // own — was silently capped at the 'write' tier's 5 req/min default,
    // completely unrelated to its own actual traffic shape. This was a real,
    // pre-existing production bug (present since Phase 1, when 'write' was
    // introduced) that simply never got exercised: no prior e2e suite made
    // more than 5 calls to the same undecorated route within one minute,
    // until the Phase 12 dating e2e suite's pet-creation volume tripped it.
    // Fix: only 'default' is meant to apply globally to every route (its
    // whole purpose); 'public'/'write'/'swipe' are meant to be *opt-in*,
    // stricter caps applied only via an explicit @Throttle({name: {...}})
    // on the specific abuse-prone routes that already declare one (see
    // auth/public/dating/identity-verification controllers) — a route-level
    // @Throttle override always wins over these array defaults regardless of
    // the number here, so raising these three doesn't loosen any of those
    // already-decorated routes' real limits at all, it just stops them from
    // silently applying to routes that never opted in.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
      {
        name: 'public',
        ttl: 60_000,
        limit: 1_000_000,
      },
      {
        name: 'write',
        ttl: 60_000,
        limit: 1_000_000,
      },
      {
        name: 'swipe',
        ttl: 60_000,
        limit: 1_000_000,
      },
    ]),

    StorageModule,

    DatabaseModule,

    HealthModule,

    AuthModule,

    UsersModule,

    PetsModule,

    PublicModule,

    QrModule,

    TagsModule,

    ScansModule,

    FoundReportsModule,

    MedicalModule,

    VaccinationsModule,

    NotificationsModule,

    AdminModule,

    ActivityModule,

    DatingModule,

    CaretakersModule,

    TagOrdersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
