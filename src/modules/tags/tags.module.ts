import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { Tag, TagSchema } from './schemas/tag.schema';

import { PetsModule } from '../pets/pets.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Tag.name,
        schema: TagSchema,
      },
    ]),

    PetsModule,
    ActivityModule,
  ],

  controllers: [TagsController],

  providers: [TagsService],

  exports: [MongooseModule, TagsService],
})
export class TagsModule {}
