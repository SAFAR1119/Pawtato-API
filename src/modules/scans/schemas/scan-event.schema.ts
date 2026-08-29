import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ScanEventDocument = HydratedDocument<ScanEvent>;

@Schema({
  timestamps: true,
})
export class ScanEvent {
  @Prop({
    type: Types.ObjectId,
    ref: 'Tag',
    required: true,
    index: true,
  })
  tag!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Pet',
    default: null,
    index: true,
  })
  pet!: Types.ObjectId | null;

  @Prop()
  approxLocation?: string;

  @Prop()
  userAgent?: string;
}

export const ScanEventSchema = SchemaFactory.createForClass(ScanEvent);

ScanEventSchema.index({ createdAt: -1 });
