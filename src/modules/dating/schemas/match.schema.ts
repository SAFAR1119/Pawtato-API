import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { MatchStatus } from '../../../common/enums/match-status.enum';

export type MatchDocument = HydratedDocument<Match>;

@Schema({
  timestamps: false,
})
export class Match {
  // Always stored in canonical order (petAId's hex string < petBId's) so a
  // lookup never has to check both orderings — see
  // DatingService.canonicalPetPair().
  @Prop({
    type: Types.ObjectId,
    ref: 'Pet',
    required: true,
  })
  petAId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Pet',
    required: true,
  })
  petBId!: Types.ObjectId;

  @Prop({
    default: () => new Date(),
  })
  matchedAt!: Date;

  @Prop({
    type: String,
    enum: MatchStatus,
    default: MatchStatus.ACTIVE,
  })
  status!: MatchStatus;

  // Owner userIds who've tapped "share my ID" within *this* match (Phase 11
  // — explicit per-match consent, not automatic on match). Sharing is
  // per-direction: a userId here makes that owner's NID viewable by the
  // other side, independent of whether the other side has shared back. See
  // DatingService.shareNid()/getNidExchange().
  @Prop({
    type: [Types.ObjectId],
    ref: 'User',
    default: [],
  })
  nidSharedBy!: Types.ObjectId[];

  // Explicit archival record (Phase 12) — set together with `status` flipping
  // to UNMATCHED in DatingService.unmatch(). Message history stays fully
  // intact and readable (see DatingService.listMessages()); only new
  // messages are blocked. Kept separate from `status` so the frontend can
  // show "archived by <name> on <date>" rather than inferring it.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  unmatchedBy!: Types.ObjectId | null;

  @Prop()
  unmatchedAt?: Date;

  // Per-side "delete conversation" (Phase 12) — hides the match from that
  // user's own matches list/message view once both sides no longer need it.
  // Deliberately never a hard delete: the underlying Match/Message documents
  // are left intact even once both owners have deleted, so a pending or
  // future DatingReport referencing this match can still be reviewed with
  // full chat context. Only ever settable via DatingService.deleteChat(),
  // and only once the match is already UNMATCHED — deleting an active
  // conversation out from under the other party isn't allowed.
  @Prop({
    type: [Types.ObjectId],
    ref: 'User',
    default: [],
  })
  deletedBy!: Types.ObjectId[];
}

export const MatchSchema = SchemaFactory.createForClass(Match);

// A mutual like can only ever produce one Match for a given pair — this is
// the race-safety net for two near-simultaneous swipe requests both trying
// to create the match (see DatingService.swipe()'s duplicate-key handling).
MatchSchema.index({ petAId: 1, petBId: 1 }, { unique: true });
MatchSchema.index({ petAId: 1 });
MatchSchema.index({ petBId: 1 });
