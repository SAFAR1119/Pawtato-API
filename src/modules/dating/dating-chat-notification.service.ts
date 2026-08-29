import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  DatingChatNotification,
  DatingChatNotificationDocument,
} from './schemas/dating-chat-notification.schema';
import { Pet, PetDocument } from '../pets/schemas/pet.schema';
import { isDuplicateKeyError } from '../../common/utils/mongo.util';

interface CreateForMessageParams {
  recipientUserId: string;
  senderUserId: string;
  senderPetId: string;
  recipientPetId: string;
  matchId: string;
  messageId: string;
}

// Dedicated service for the Dating -> Match & Chats unread system — see
// dating-chat-notification.schema.ts for why this is a wholly separate
// store from NotificationsService/NotificationsModule. Nothing here ever
// reads from or writes to the general Notification collection.
@Injectable()
export class DatingChatNotificationService {
  constructor(
    @InjectModel(DatingChatNotification.name)
    private readonly model: Model<DatingChatNotificationDocument>,

    @InjectModel(Pet.name)
    private readonly petModel: Model<PetDocument>,
  ) {}

  // Called only after DatingService.sendMessage() has already persisted the
  // Message (see DatingChatNotificationListener, which reacts to
  // DATING_MESSAGE_SENT) — a failed send never reaches here. Idempotent: a
  // duplicate call for the same (recipient, message) pair — a retried
  // event, or the same message somehow processed twice — hits the unique
  // index and is swallowed rather than producing a second unread row.
  async createForMessage(params: CreateForMessageParams): Promise<void> {
    try {
      await this.model.create({
        recipientUserId: new Types.ObjectId(params.recipientUserId),
        senderUserId: new Types.ObjectId(params.senderUserId),
        senderPetId: new Types.ObjectId(params.senderPetId),
        recipientPetId: new Types.ObjectId(params.recipientPetId),
        matchId: new Types.ObjectId(params.matchId),
        messageId: new Types.ObjectId(params.messageId),
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }

  // Lightweight COUNT for the app-shell "Dating" badge and the Dating hub's
  // "Match & Chats" badge. Both fields are currently always equal — dating
  // chat notifications are the only kind this system produces today — but
  // are kept as two fields so the frontend can read each badge from its own
  // field rather than assuming they'll always match.
  async getUnreadSummary(recipientUserId: string) {
    const totalUnread = await this.model.countDocuments({
      recipientUserId: new Types.ObjectId(recipientUserId),
    });

    return { totalUnread, matchChatsUnread: totalUnread };
  }

  // One row per conversation with an unread message, grouped and counted
  // DB-side (never loading every notification into memory to group in
  // application code) — backs the Match & Chats list's per-pet unread
  // badges. `senderPetId`/`recipientPetId` are constant within a single
  // conversation's unread set (a match is always between exactly the same
  // two pets), so $first is safe there once sorted newest-first.
  async listUnreadConversations(recipientUserId: string) {
    const groups = await this.model.aggregate<{
      _id: Types.ObjectId;
      unreadCount: number;
      senderPetId: Types.ObjectId;
      recipientPetId: Types.ObjectId;
      lastMessageAt: Date;
    }>([
      { $match: { recipientUserId: new Types.ObjectId(recipientUserId) } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$matchId',
          unreadCount: { $sum: 1 },
          senderPetId: { $first: '$senderPetId' },
          recipientPetId: { $first: '$recipientPetId' },
          lastMessageAt: { $first: '$createdAt' },
        },
      },
      { $sort: { lastMessageAt: -1 } },
    ]);

    if (groups.length === 0) {
      return [];
    }

    const senderPets = await this.petModel
      .find({ _id: { $in: groups.map((g) => g.senderPetId) } })
      .select('name profileImage');
    const senderPetMap = new Map(
      senderPets.map((pet) => [pet._id.toString(), pet]),
    );

    return groups.map((group) => {
      const senderPet = senderPetMap.get(group.senderPetId.toString());

      return {
        matchId: group._id.toString(),
        senderPetId: group.senderPetId.toString(),
        senderPetName: senderPet?.name ?? null,
        senderPetProfileImage: senderPet?.profileImage ?? null,
        recipientPetId: group.recipientPetId.toString(),
        unreadCount: group.unreadCount,
        lastMessageAt: group.lastMessageAt,
      };
    });
  }

  // "Opening the chat" — deletes every currently-unread notification for
  // this (recipient, conversation) pair. The find-then-delete-by-id shape
  // (rather than a single deleteMany({recipientUserId, matchId})) is
  // deliberate: it fixes the message-during-read race (see
  // PAWTATO_FRONTEND_BLUEPRINT.md-equivalent spec section on this) by only
  // ever deleting the exact rows that existed at the moment this call
  // started. A message — and its notification — created concurrently after
  // that point gets a new _id that was never in this set, so it survives.
  async markConversationRead(recipientUserId: string, matchId: string) {
    const filter = {
      recipientUserId: new Types.ObjectId(recipientUserId),
      matchId: new Types.ObjectId(matchId),
    };

    const unread = await this.model.find(filter, { _id: 1 });

    if (unread.length === 0) {
      return { deletedCount: 0 };
    }

    const result = await this.model.deleteMany({
      _id: { $in: unread.map((n) => n._id) },
    });

    return { deletedCount: result.deletedCount };
  }

  // Cascade delete — mirrors DatingService.deleteAllForPets/the pattern
  // every other pet-keyed dating collection follows (see
  // DatingService.handlePetDeleted). Called for both the sender and
  // recipient side, since a notification can reference a deleted pet in
  // either role.
  async deleteAllForPets(petIds: string[]) {
    if (petIds.length === 0) {
      return { deletedCount: 0 };
    }

    const objectIds = petIds.map((id) => new Types.ObjectId(id));

    const result = await this.model.deleteMany({
      $or: [
        { senderPetId: { $in: objectIds } },
        { recipientPetId: { $in: objectIds } },
      ],
    });

    return { deletedCount: result.deletedCount };
  }

  // Cascade delete for a match being torn down entirely (see
  // DatingService.deleteAllForPets, which deletes every Match a removed
  // pet was part of) — belt-and-braces alongside deleteAllForPets above,
  // since a match's *other* pet (not itself deleted) could still have
  // stray notifications tied to this exact matchId.
  async deleteAllForMatches(matchIds: Types.ObjectId[]) {
    if (matchIds.length === 0) {
      return { deletedCount: 0 };
    }

    const result = await this.model.deleteMany({
      matchId: { $in: matchIds },
    });

    return { deletedCount: result.deletedCount };
  }
}
