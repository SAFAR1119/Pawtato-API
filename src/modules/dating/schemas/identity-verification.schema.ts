import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { IdentityVerificationStatus } from '../../../common/enums/identity-verification-status.enum';

export type IdentityVerificationDocument =
  HydratedDocument<IdentityVerification>;

@Schema({
  timestamps: true,
})
export class IdentityVerification {
  // One verification per user (not per pet) — an NID belongs to the owner,
  // not to any single pet. A resubmission updates this document in place
  // rather than creating a new one — see IdentityVerificationService.submit().
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  userId!: Types.ObjectId;

  // Private storage keys, never public URLs — resolved to short-lived signed
  // URLs on demand by IdentityVerificationService.getSignedNidUrls(), never
  // returned directly by any read endpoint. See StorageProvider.uploadPrivate.
  @Prop({
    required: true,
  })
  nidFrontKey!: string;

  @Prop({
    required: true,
  })
  nidBackKey!: string;

  @Prop({
    type: String,
    enum: IdentityVerificationStatus,
    default: IdentityVerificationStatus.PENDING,
  })
  status!: IdentityVerificationStatus;

  @Prop({
    default: () => new Date(),
  })
  submittedAt!: Date;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
  })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  rejectionReason?: string;
}

export const IdentityVerificationSchema =
  SchemaFactory.createForClass(IdentityVerification);
