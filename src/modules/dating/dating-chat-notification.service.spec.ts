import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { DatingChatNotificationService } from './dating-chat-notification.service';
import { DatingChatNotification } from './schemas/dating-chat-notification.schema';
import { Pet } from '../pets/schemas/pet.schema';

describe('DatingChatNotificationService', () => {
  let service: DatingChatNotificationService;
  let model: {
    create: jest.Mock;
    countDocuments: jest.Mock;
    aggregate: jest.Mock;
    find: jest.Mock;
    deleteMany: jest.Mock;
  };
  let petModel: { find: jest.Mock };

  const recipientUserId = new Types.ObjectId().toString();
  const senderUserId = new Types.ObjectId().toString();
  const senderPetId = new Types.ObjectId().toString();
  const recipientPetId = new Types.ObjectId().toString();
  const matchId = new Types.ObjectId().toString();
  const messageId = new Types.ObjectId().toString();

  beforeEach(async () => {
    model = {
      create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      countDocuments: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    petModel = {
      find: jest
        .fn()
        .mockReturnValue({ select: jest.fn().mockResolvedValue([]) }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatingChatNotificationService,
        {
          provide: getModelToken(DatingChatNotification.name),
          useValue: model,
        },
        { provide: getModelToken(Pet.name), useValue: petModel },
      ],
    }).compile();

    service = module.get<DatingChatNotificationService>(
      DatingChatNotificationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createForMessage', () => {
    it('creates a notification row for the recipient', async () => {
      await service.createForMessage({
        recipientUserId,
        senderUserId,
        senderPetId,
        recipientPetId,
        matchId,
        messageId,
      });

      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: new Types.ObjectId(recipientUserId),
          senderUserId: new Types.ObjectId(senderUserId),
          senderPetId: new Types.ObjectId(senderPetId),
          recipientPetId: new Types.ObjectId(recipientPetId),
          matchId: new Types.ObjectId(matchId),
          messageId: new Types.ObjectId(messageId),
        }),
      );
    });

    it('swallows a duplicate-key error — the same message already notified this recipient', async () => {
      model.create.mockRejectedValue({ code: 11000 });

      await expect(
        service.createForMessage({
          recipientUserId,
          senderUserId,
          senderPetId,
          recipientPetId,
          matchId,
          messageId,
        }),
      ).resolves.toBeUndefined();
    });

    it('re-throws a non-duplicate-key error', async () => {
      model.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.createForMessage({
          recipientUserId,
          senderUserId,
          senderPetId,
          recipientPetId,
          matchId,
          messageId,
        }),
      ).rejects.toThrow('db down');
    });
  });

  describe('getUnreadSummary', () => {
    it('returns the same count for both fields — chat notifications are the only source today', async () => {
      model.countDocuments.mockResolvedValue(5);

      const result = await service.getUnreadSummary(recipientUserId);

      expect(result).toEqual({ totalUnread: 5, matchChatsUnread: 5 });
      expect(model.countDocuments).toHaveBeenCalledWith({
        recipientUserId: new Types.ObjectId(recipientUserId),
      });
    });
  });

  describe('listUnreadConversations', () => {
    it('returns an empty array without querying pets when there are no unread rows', async () => {
      model.aggregate.mockResolvedValue([]);

      const result = await service.listUnreadConversations(recipientUserId);

      expect(result).toEqual([]);
      expect(petModel.find).not.toHaveBeenCalled();
    });

    it('enriches each conversation group with the sender pet name/photo', async () => {
      const senderPetObjectId = new Types.ObjectId(senderPetId);
      const recipientPetObjectId = new Types.ObjectId(recipientPetId);
      const matchObjectId = new Types.ObjectId(matchId);
      const lastMessageAt = new Date();

      model.aggregate.mockResolvedValue([
        {
          _id: matchObjectId,
          unreadCount: 3,
          senderPetId: senderPetObjectId,
          recipientPetId: recipientPetObjectId,
          lastMessageAt,
        },
      ]);
      petModel.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            _id: senderPetObjectId,
            name: 'Bruno',
            profileImage: 'bruno.png',
          },
        ]),
      });

      const result = await service.listUnreadConversations(recipientUserId);

      expect(result).toEqual([
        {
          matchId: matchObjectId.toString(),
          senderPetId: senderPetObjectId.toString(),
          senderPetName: 'Bruno',
          senderPetProfileImage: 'bruno.png',
          recipientPetId: recipientPetObjectId.toString(),
          unreadCount: 3,
          lastMessageAt,
        },
      ]);
    });
  });

  describe('markConversationRead', () => {
    it('is a no-op when there is nothing unread in this conversation', async () => {
      model.find.mockResolvedValue([]);

      const result = await service.markConversationRead(
        recipientUserId,
        matchId,
      );

      expect(result).toEqual({ deletedCount: 0 });
      expect(model.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes exactly the rows that existed at read time, not a live filter re-evaluated at delete time', async () => {
      const idA = new Types.ObjectId();
      const idB = new Types.ObjectId();
      model.find.mockResolvedValue([{ _id: idA }, { _id: idB }]);
      model.deleteMany.mockResolvedValue({ deletedCount: 2 });

      const result = await service.markConversationRead(
        recipientUserId,
        matchId,
      );

      expect(model.deleteMany).toHaveBeenCalledWith({
        _id: { $in: [idA, idB] },
      });
      expect(result).toEqual({ deletedCount: 2 });
    });
  });

  describe('cascade delete helpers', () => {
    it('deleteAllForPets skips the query for an empty pet list', async () => {
      const result = await service.deleteAllForPets([]);

      expect(model.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ deletedCount: 0 });
    });

    it('deleteAllForMatches skips the query for an empty match list', async () => {
      const result = await service.deleteAllForMatches([]);

      expect(model.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ deletedCount: 0 });
    });
  });
});
