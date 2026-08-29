import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ActivityDocument = HydratedDocument<Activity>;

@Schema({
  timestamps: true,
})
export class Activity {
  // The user who performed the logged action — an admin for admin-panel
  // actions (block/unblock/role change/tag suspend/retire/bulk-create/
  // found-report moderation), or the resource's own owner for sensitive
  // self-service actions (tag assign/unassign/claim, pet lost/found).
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  actor!: Types.ObjectId;

  @Prop({
    required: true,
    index: true,
  })
  action!: string;

  @Prop({
    required: true,
  })
  target!: string;

  @Prop({
    type: MongooseSchema.Types.Mixed,
    default: {},
  })
  metadata!: Record<string, any>;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

ActivitySchema.index({ createdAt: -1 });
