import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PublicController } from './public.controller';
import { PublicService } from './public.service';

import { Pet, PetSchema } from '../pets/schemas/pet.schema';
import { Tag, TagSchema } from '../tags/schemas/tag.schema';
import { ScansModule } from '../scans/scans.module';
import { FoundReportsModule } from '../found-reports/found-reports.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Pet.name,
        schema: PetSchema,
      },
      {
        name: Tag.name,
        schema: TagSchema,
      },
    ]),

    ScansModule,
    FoundReportsModule,
  ],

  controllers: [PublicController],

  providers: [PublicService],
})
export class PublicModule {}
