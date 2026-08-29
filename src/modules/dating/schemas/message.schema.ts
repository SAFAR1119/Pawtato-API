import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
})
export class Message {
  @Prop({
    type: Types.ObjectId,
    ref: 'Match',
    required: true,
    index: true,
  })
  matchId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  senderUserId!: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    maxlength: 2000,
  })
  content!: string;

  @Prop()
  readAt?: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
