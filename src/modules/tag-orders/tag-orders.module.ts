import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { TagOrdersController } from './tag-orders.controller';
import { TagOrdersService } from './tag-orders.service';
import { StripeService } from './stripe.service';
import { TagOrder, TagOrderSchema } from './schemas/tag-order.schema';

import { TagsModule } from '../tags/tags.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TagOrder.name, schema: TagOrderSchema },
    ]),

    TagsModule,
    ActivityModule,
  ],

  controllers: [TagOrdersController],

  providers: [TagOrdersService, StripeService],

  exports: [TagOrdersService],
})
export class TagOrdersModule {}
