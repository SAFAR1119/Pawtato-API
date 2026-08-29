import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import {
  AttachedDocument,
  AttachedDocumentSchema,
} from '../../../common/schemas/attached-document.schema';

export type VaccinationDocument = HydratedDocument<Vaccination>;

@Schema({
  timestamps: true,
})
export class Vaccination {
  @Prop({
    type: Types.ObjectId,
    ref: 'Pet',
    required: true,
    index: true,
  })
  pet!: Types.ObjectId;
  @Prop({
    default: false,
  })
  reminderSent!: boolean;

  @Prop()
  lastReminderSentAt?: Date;

  @Prop({
    required: true,
  })
  vaccineName!: string;

  @Prop({
    required: true,
  })
  administeredDate!: Date;

  @Prop({
    required: true,
  })
  nextDueDate!: Date;

  @Prop()
  veterinarian?: string;

  @Prop()
  clinic?: string;

  @Prop()
  notes?: string;

  // Phase 16 — attached certificates (e.g. the physical rabies certificate,
  // scanned). Managed only through VaccinationsService.addDocument()/
  // removeDocument(), same pattern as MedicalRecord.documents.
  @Prop({ type: [AttachedDocumentSchema], default: [] })
  documents!: AttachedDocument[];
}

export const VaccinationSchema = SchemaFactory.createForClass(Vaccination);

// Backs VaccinationReminderJob's daily sweep:
// `{ reminderSent: false, nextDueDate: { $gte, $lte } }`.
VaccinationSchema.index({ reminderSent: 1, nextDueDate: 1 });
