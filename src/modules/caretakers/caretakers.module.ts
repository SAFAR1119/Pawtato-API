import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CaretakersController } from './caretakers.controller';
import { MyCaretakingController } from './my-caretaking.controller';
import { CaretakersService } from './caretakers.service';

import {
  PetCaretaker,
  PetCaretakerSchema,
} from './schemas/pet-caretaker.schema';

import { PetsModule } from '../pets/pets.module';
import { UsersModule } from '../users/users.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PetCaretaker.name, schema: PetCaretakerSchema },
    ]),

    PetsModule,
    UsersModule,
    ActivityModule,
  ],

  controllers: [CaretakersController, MyCaretakingController],

  providers: [CaretakersService],

  exports: [CaretakersService],
})
export class CaretakersModule {}
