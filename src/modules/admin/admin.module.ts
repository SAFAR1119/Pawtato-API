import { Module } from '@nestjs/common';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

import { UsersModule } from '../users/users.module';
import { PetsModule } from '../pets/pets.module';
import { TagsModule } from '../tags/tags.module';
import { ScansModule } from '../scans/scans.module';
import { VaccinationsModule } from '../vaccinations/vaccinations.module';
import { MedicalModule } from '../medical/medical.module';
import { FoundReportsModule } from '../found-reports/found-reports.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityModule } from '../activity/activity.module';
import { DatingModule } from '../dating/dating.module';
import { CaretakersModule } from '../caretakers/caretakers.module';
import { TagOrdersModule } from '../tag-orders/tag-orders.module';

@Module({
  imports: [
    UsersModule,
    PetsModule,
    TagsModule,
    ScansModule,
    VaccinationsModule,
    MedicalModule,
    FoundReportsModule,
    NotificationsModule,
    ActivityModule,
    DatingModule,
    CaretakersModule,
    TagOrdersModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
