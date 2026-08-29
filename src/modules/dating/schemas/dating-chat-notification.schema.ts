import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DatingChatNotificationDocument =
  HydratedDocument<DatingChatNotification>;

// Dedicated unread-state store for Dating -> Match & Chats — deliberately
// separate from the platform's general Notification collection (see
// PAWTATO_FRONTEND_BLUEPRINT.md's "Dating Chat Notifications" section): the
// Dating badge must never be derived from, or feed into, the existing
// notification feed. One row = one unread message for one recipient;
// "read" means the row no longer exists (see
// DatingChatNotificationService.markConversationRead) — there is no IsRead
// flag anywhere in this collection by design.
//
// `matchId` doubles as the conversation id: this codebase has no separate
// Conversation entity, a Match *is* the conversation (see Message.matchId
// on the existing dating chat), so this reuses that identifier rather than
// inventing a duplicate concept.
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class DatingChatNotification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recipientUserId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderUserId!: Types.ObjectId;

  // The exact pet on each side of the conversation the message belongs to —
  // resolved once, at creation time, from the originating Match's
  // petAId/petBId (see DatingChatNotificationListener). Stored directly
  // (rather than re-derived from matchId + senderUserId on every read) so
  // list/summary queries never need a second round-trip per row to figure
  // out which of an owner's several pets is involved.
  @Prop({ type: Types.ObjectId, ref: 'Pet', required: true })
  senderPetId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Pet', required: true })
  recipientPetId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Match', required: true })
  matchId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Message', required: true })
  messageId!: Types.ObjectId;
}

export const DatingChatNotificationSchema = SchemaFactory.createForClass(
  DatingChatNotification,
);

// One notification per (recipient, message), ever — the idempotency
// guarantee a retried/duplicated message-sent event relies on (see
// DatingChatNotificationService.createForMessage): a second attempt for the
// same message simply hits E11000 and is swallowed as a no-op.
DatingChatNotificationSchema.index(
  { recipientUserId: 1, messageId: 1 },
  { unique: true },
);
// Backs markConversationRead()'s per-conversation lookup/delete and the
// unread-chats list's per-match grouping — both filter on exactly this pair.
DatingChatNotificationSchema.index({ recipientUserId: 1, matchId: 1 });
// Backs the unread-summary COUNT query (a plain per-user count, no sort).
DatingChatNotificationSchema.index({ recipientUserId: 1, createdAt: -1 });
