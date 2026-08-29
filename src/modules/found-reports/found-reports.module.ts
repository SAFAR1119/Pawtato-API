import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { FoundReportsController } from './found-reports.controller';
import { TagFoundReportsController } from './tag-found-reports.controller';
import { FoundReportsService } from './found-reports.service';
import { FoundReport, FoundReportSchema } from './schemas/found-report.schema';

import { TagsModule } from '../tags/tags.module';
import { PetsModule } from '../pets/pets.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: FoundReport.name,
        schema: FoundReportSchema,
      },
    ]),

    TagsModule,
    PetsModule,
    ActivityModule,
  ],

  controllers: [FoundReportsController, TagFoundReportsController],

  providers: [FoundReportsService],

  exports: [FoundReportsService],
})
export class FoundReportsModule {}
