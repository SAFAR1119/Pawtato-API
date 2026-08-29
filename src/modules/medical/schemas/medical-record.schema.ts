import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import {
  AttachedDocument,
  AttachedDocumentSchema,
} from '../../../common/schemas/attached-document.schema';

export type MedicalRecordDocument = HydratedDocument<MedicalRecord>;

@Schema({
  timestamps: true,
})
export class MedicalRecord {
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
  title!: string;

  @Prop()
  diagnosis?: string;

  @Prop()
  treatment?: string;

  @Prop()
  veterinarian?: string;

  @Prop()
  clinic?: string;

  @Prop()
  visitDate?: Date;

  @Prop()
  notes?: string;

  // Phase 16 — attached certificates/lab results/vet letters. Managed only
  // through MedicalService.addDocument()/removeDocument(), never directly
  // via create()/update — mirrors this codebase's established pattern of
  // never letting arbitrary client input construct a stored-file reference.
  @Prop({ type: [AttachedDocumentSchema], default: [] })
  documents!: AttachedDocument[];
}

export const MedicalRecordSchema = SchemaFactory.createForClass(MedicalRecord);
