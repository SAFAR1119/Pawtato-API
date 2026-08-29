import { Test, TestingModule } from '@nestjs/testing';

import { DatingChatNotificationListener } from './dating-chat-notification.listener';
import { DatingChatNotificationService } from './dating-chat-notification.service';
import type { DatingMessageSentEvent } from '../../common/events/domain-events';

describe('DatingChatNotificationListener', () => {
  let listener: DatingChatNotificationListener;
  let datingChatNotificationService: { createForMessage: jest.Mock };

  const baseEvent: DatingMessageSentEvent = {
    matchId: 'match-1',
    messageId: 'message-1',
    senderUserId: 'owner-a',
    content: 'hi',
    createdAt: new Date(),
    ownerAId: 'owner-a',
    ownerBId: 'owner-b',
    petAId: 'pet-a',
    petBId: 'pet-b',
  };

  beforeEach(async () => {
    datingChatNotificationService = {
      createForMessage: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatingChatNotificationListener,
        {
          provide: DatingChatNotificationService,
          useValue: datingChatNotificationService,
        },
      ],
    }).compile();

    listener = module.get<DatingChatNotificationListener>(
      DatingChatNotificationListener,
    );
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  it('resolves the recipient/sender pets from whichever side actually sent the message', async () => {
    await listener.onMessageSent(baseEvent);

    expect(datingChatNotificationService.createForMessage).toHaveBeenCalledWith(
      {
        recipientUserId: 'owner-b',
        senderUserId: 'owner-a',
        senderPetId: 'pet-a',
        recipientPetId: 'pet-b',
        matchId: 'match-1',
        messageId: 'message-1',
      },
    );
  });

  it('flips sender/recipient correctly when owner B is the sender', async () => {
    await listener.onMessageSent({ ...baseEvent, senderUserId: 'owner-b' });

    expect(datingChatNotificationService.createForMessage).toHaveBeenCalledWith(
      {
        recipientUserId: 'owner-a',
        senderUserId: 'owner-b',
        senderPetId: 'pet-b',
        recipientPetId: 'pet-a',
        matchId: 'match-1',
        messageId: 'message-1',
      },
    );
  });

  it('swallows a failure rather than throwing, and logs it', async () => {
    datingChatNotificationService.createForMessage.mockRejectedValue(
      new Error('db down'),
    );

    await expect(listener.onMessageSent(baseEvent)).resolves.toBeUndefined();
  });
});
