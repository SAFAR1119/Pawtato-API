import { Test, TestingModule } from '@nestjs/testing';

import { DatingChatNotificationController } from './dating-chat-notification.controller';
import { DatingChatNotificationService } from './dating-chat-notification.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

describe('DatingChatNotificationController', () => {
  let controller: DatingChatNotificationController;
  let datingChatNotificationService: {
    getUnreadSummary: jest.Mock;
    listUnreadConversations: jest.Mock;
  };

  const user = { sub: 'user-1' } as JwtPayload;

  beforeEach(async () => {
    datingChatNotificationService = {
      getUnreadSummary: jest.fn().mockResolvedValue({
        totalUnread: 2,
        matchChatsUnread: 2,
      }),
      listUnreadConversations: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatingChatNotificationController],
      providers: [
        {
          provide: DatingChatNotificationService,
          useValue: datingChatNotificationService,
        },
      ],
    }).compile();

    controller = module.get<DatingChatNotificationController>(
      DatingChatNotificationController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getUnreadSummary delegates to the service, scoped to the caller', async () => {
    const result = await controller.getUnreadSummary(user);

    expect(datingChatNotificationService.getUnreadSummary).toHaveBeenCalledWith(
      'user-1',
    );
    expect(result).toEqual({ totalUnread: 2, matchChatsUnread: 2 });
  });

  it('listUnread delegates to the service, scoped to the caller', async () => {
    await controller.listUnread(user);

    expect(
      datingChatNotificationService.listUnreadConversations,
    ).toHaveBeenCalledWith('user-1');
  });
});
