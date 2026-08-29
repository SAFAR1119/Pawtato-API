import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { SwipeAction } from '../../../common/enums/swipe-action.enum';
import { DatingMode } from '../../../common/enums/dating-mode.enum';

export type SwipeDocument = HydratedDocument<Swipe>;

// `updatedAt` doubles as "when the current decision was made" — a swipe
// document is upserted in place rather than re-created when its pet
// reappears in discover() after the dating-pool reset window and gets
// swiped on again (see DatingService.swipe()/discover()), so `createdAt`
// stays the original decision while `updatedAt` drives the reset-window
// math. A single mutable row per (fromPetId, toPetId, mode) also means the
// reciprocal-LIKE lookup in DatingService.swipe() always reflects the
// swiper's *current* decision, never a stale one from before a PASS/LIKE
// flip.
@Schema({
  timestamps: true,
})
export class Swipe {
  @Prop({
    type: Types.ObjectId,
    ref: 'Pet',
    required: true,
  })
  fromPetId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Pet',
    required: true,
  })
  toPetId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: SwipeAction,
    required: true,
  })
  action!: SwipeAction;

  // Which mode pool this swipe happened in — a pet can be enabled for both
  // BREEDING and PLAYDATE, so a Match alone can't reconstruct which context
  // produced it after the fact. Purely for traceability (admin/analytics,
  // and the Matches List mode icon in the frontend) — swipe validity itself
  // is already fully enforced before this is ever written.
  @Prop({
    type: String,
    enum: DatingMode,
    required: true,
  })
  mode!: DatingMode;
}

export const SwipeSchema = SchemaFactory.createForClass(Swipe);

// At most one swipe row per (fromPetId, toPetId, mode) ever exists —
// DatingService.swipe() relies on this both to detect a genuine concurrent
// duplicate via the resulting E11000 (same race-safety pattern as
// Tag.assignedPetId) and, once the existing row is past the dating-pool
// reset window, to upsert it in place rather than insert a second one.
// Scoped to `mode` (not just the pair) because a pet pair can legitimately
// appear in both the BREEDING and PLAYDATE pools — e.g. two same-species
// pets that are both PLAYDATE- and BREEDING-enabled — and a PASS in one
// mode must not block a genuinely separate decision in the other.
SwipeSchema.index({ fromPetId: 1, toPetId: 1, mode: 1 }, { unique: true });
