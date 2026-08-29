import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PetsController } from './pets.controller';
import { PetsService } from './pets.service';

import { Pet, PetSchema } from './schemas/pet.schema';
import {
  PetCaretaker,
  PetCaretakerSchema,
} from '../caretakers/schemas/pet-caretaker.schema';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Pet.name,
        schema: PetSchema,
      },
      // Read-only here — see PetsService.findAccessiblePet(). Registered
      // locally (not via a CaretakersModule import) to avoid a real
      // circular dependency: CaretakersModule needs PetsService for its own
      // ownership checks.
      {
        name: PetCaretaker.name,
        schema: PetCaretakerSchema,
      },
    ]),

    ActivityModule,
  ],

  controllers: [PetsController],

  providers: [PetsService],

  exports: [MongooseModule, PetsService],
})
export class PetsModule {}
