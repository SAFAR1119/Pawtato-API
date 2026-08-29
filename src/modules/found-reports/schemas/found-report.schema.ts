import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { FoundReportStatus } from '../../../common/enums/found-report-status.enum';

export type FoundReportDocument = HydratedDocument<FoundReport>;

@Schema({
  timestamps: true,
})
export class FoundReport {
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
    required: true,
    index: true,
  })
  pet!: Types.ObjectId;

  @Prop({
    required: true,
  })
  message!: string;

  @Prop()
  approxLocation?: string;

  @Prop()
  contactInfo?: string;

  @Prop()
  photoUrl?: string;

  // Opaque client-generated identifier (not tied to any account — this
  // endpoint is anonymous/no-auth) used to rate-limit spam/abuse. See
  // FoundReportsService.assertNotSpamming().
  @Prop({
    required: true,
    index: true,
  })
  deviceFingerprint!: string;

  @Prop({
    default: () => new Date(),
  })
  foundAt!: Date;

  // Moderation state — admin abuse-review surface (Phase 7). Every report
  // starts PENDING; an admin triages it as legitimate (REVIEWED) or spam/
  // malicious (DISMISSED/ACTIONED). Not touched by the finder-facing create
  // flow at all.
  @Prop({
    type: String,
    enum: FoundReportStatus,
    default: FoundReportStatus.PENDING,
    index: true,
  })
  status!: FoundReportStatus;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  reviewedBy!: Types.ObjectId | null;

  @Prop()
  reviewedAt?: Date;
}

export const FoundReportSchema = SchemaFactory.createForClass(FoundReport);
