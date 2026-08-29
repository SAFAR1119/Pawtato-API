import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AttachedDocumentDocument = HydratedDocument<AttachedDocument>;

// A single uploaded file (vaccination certificate, vet letter, lab result,
// ...) attached to a MedicalRecord or Vaccination entry — Phase 16 (Post-MVP
// Backlog: "Expanded medical records beyond the current medical/vaccinations
// modules (documents, certificates)"). Shared across both modules rather
// than duplicated, since the shape is identical; lives in `common/schemas`
// (a new top-level home, alongside this codebase's existing `common/dto`,
// `common/enums`, `common/utils`) because it's a genuinely cross-module
// concept, not owned by either `medical` or `vaccinations` specifically.
//
// Used as an embedded subdocument array (`documents: AttachedDocument[]`),
// not a separate top-level collection — a document has no meaning detached
// from the record it was uploaded against, and this codebase already
// prefers embedding over a join for this kind of 1:few, always-loaded-
// together relationship (see e.g. Match.nidSharedBy/deletedBy).
@Schema({ _id: true })
export class AttachedDocument {
  // Mongoose auto-generates this for every subdocument array element
  // (`_id: true` above is actually the default — kept explicit for
  // clarity); declared here only so TypeScript knows it exists, since
  // `@nestjs/mongoose` doesn't infer implicit schema fields.
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  url!: string;

  @Prop({ required: true, trim: true })
  fileName!: string;

  @Prop({ required: true, trim: true })
  mimeType!: string;

  @Prop({ default: () => new Date() })
  uploadedAt!: Date;
}

export const AttachedDocumentSchema =
  SchemaFactory.createForClass(AttachedDocument);
