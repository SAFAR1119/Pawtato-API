import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PetCaretakerDocument = HydratedDocument<PetCaretaker>;

// Grants a second user (vet, family member, pet-sitter, ...) shared access
// to a pet the caller owns — Phase 15 (Post-MVP Backlog: "Multiple
// authorized caretakers / shared pet access"). Deliberately a single flat
// access level (no VIEWER/EDITOR role split): a caretaker can view the pet
// and its medical/vaccination/scan/found-report history, and can report it
// lost/found — the same "someone helping look after this animal" scope in
// every real scenario this was asked for (vet visit, boarding, pet-sitting).
// Editing the pet's own identity fields, managing photos, deleting the pet,
// managing other caretakers, tags, and the dating module all remain
// owner-only — see PetsService.findAccessiblePet() for exactly which
// actions this unlocks, and PAWTATO_ROADMAP.md's Phase 15 section for the
// full scope-boundary reasoning.
//
// Direct-add, not an invite/accept flow: the owner must already know the
// caretaker's registered account email, and access is immediate — kept
// deliberately simple rather than building a second notification/invitation
// subsystem for this.
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class PetCaretaker {
  @Prop({ type: Types.ObjectId, ref: 'Pet', required: true })
  petId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  // The owner who granted access — display/audit context only ("added by
  // X"). Never itself used for authorization: the pet's real owner is
  // always re-derived live from Pet.owner, never trusted from this field.
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  addedBy!: Types.ObjectId;
}

export const PetCaretakerSchema = SchemaFactory.createForClass(PetCaretaker);

// A user can be a caretaker of a given pet at most once.
PetCaretakerSchema.index({ petId: 1, userId: 1 }, { unique: true });
// Backs "list every pet I'm a caretaker for" (GET /caretaking/pets) and the
// user-deletion cascade (a deleted caretaker's access on other owners' pets
// must also be cleaned up).
PetCaretakerSchema.index({ userId: 1 });
