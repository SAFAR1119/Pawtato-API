import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { VaccinationsController } from './vaccinations.controller';
import { VaccinationsService } from './vaccinations.service';

import { Vaccination, VaccinationSchema } from './schemas/vaccination.schema';

import { PetsModule } from '../pets/pets.module';

@Module({
  imports: [
    PetsModule,

    MongooseModule.forFeature([
      {
        name: Vaccination.name,
        schema: VaccinationSchema,
      },
    ]),
  ],

  controllers: [VaccinationsController],

  providers: [VaccinationsService],

  exports: [VaccinationsService, MongooseModule],
})
export class VaccinationsModule {}
