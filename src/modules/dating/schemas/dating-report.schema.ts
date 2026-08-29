import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { DatingReportStatus } from '../../../common/enums/dating-report-status.enum';

export type DatingReportDocument = HydratedDocument<DatingReport>;

@Schema({
  timestamps: true,
})
export class DatingReport {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  reporterUserId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Pet',
    required: true,
    index: true,
  })
  targetPetId!: Types.ObjectId;

  // Optional (Phase 12) — set when a report is filed from a specific match's
  // chat (e.g. "Report" inside a conversation, harassment in messages)
  // rather than from a profile card. Lets admin pull the actual conversation
  // for context via GET /admin/dating/reports/:id/messages, instead of only
  // ever seeing the profile the report names. Never required — a profile can
  // still be reported with no match context at all.
  @Prop({
    type: Types.ObjectId,
    ref: 'Match',
    default: null,
    index: true,
  })
  matchId!: Types.ObjectId | null;

  @Prop({
    required: true,
    trim: true,
    maxlength: 1000,
  })
  reason!: string;

  @Prop({
    type: String,
    enum: DatingReportStatus,
    default: DatingReportStatus.PENDING,
    index: true,
  })
  status!: DatingReportStatus;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  reviewedBy!: Types.ObjectId | null;

  @Prop()
  reviewedAt?: Date;
}

export const DatingReportSchema = SchemaFactory.createForClass(DatingReport);
