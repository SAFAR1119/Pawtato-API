import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MedicalController } from './medical.controller';
import { MedicalService } from './medical.service';

import {
  MedicalRecord,
  MedicalRecordSchema,
} from './schemas/medical-record.schema';

import { PetsModule } from '../pets/pets.module';

@Module({
  imports: [
    PetsModule,

    MongooseModule.forFeature([
      {
        name: MedicalRecord.name,
        schema: MedicalRecordSchema,
      },
    ]),
  ],

  controllers: [MedicalController],

  providers: [MedicalService],

  exports: [MedicalService, MongooseModule],
})
export class MedicalModule {}
