import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';
import { ScanEvent, ScanEventSchema } from './schemas/scan-event.schema';

import { PetsModule } from '../pets/pets.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ScanEvent.name,
        schema: ScanEventSchema,
      },
    ]),

    PetsModule,
  ],

  controllers: [ScansController],

  providers: [ScansService],

  exports: [ScansService],
})
export class ScansModule {}
