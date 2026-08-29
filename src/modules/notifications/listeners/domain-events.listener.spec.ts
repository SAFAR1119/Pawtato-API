import { Test, TestingModule } from '@nestjs/testing';
import { DomainEventsListener } from './domain-events.listener';
import { NotificationsService } from '../notifications.service';
import { NOTIFICATION_CHANNELS } from '../notifications.constants';
import type { DatingMatchCreatedEvent } from '../../../common/events/domain-events';

describe('DomainEventsListener', () => {
  let listener: DomainEventsListener;
  let notificationsService: { create: jest.Mock };

  beforeEach(async () => {
    notificationsService = { create: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainEventsListener,
        { provide: NotificationsService, useValue: notificationsService },
        { provide: NOTIFICATION_CHANNELS, useValue: [] },
      ],
    }).compile();

    listener = module.get<DomainEventsListener>(DomainEventsListener);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('onDatingMatchCreated', () => {
    const event: DatingMatchCreatedEvent = {
      matchId: 'match-1',
      petAId: 'pet-a',
      petBId: 'pet-b',
      ownerAId: 'owner-a',
      ownerBId: 'owner-b',
      petAName: 'Rex',
      petBName: 'Bella',
    };

    it("creates exactly one notification per owner, each from that owner's own pet perspective", async () => {
      await listener.onDatingMatchCreated(event);

      expect(notificationsService.create).toHaveBeenCalledTimes(2);

      expect(notificationsService.create).toHaveBeenCalledWith(
        'owner-a',
        'dating.match-created',
        "It's a match!",
        expect.stringContaining('Rex matched with Bella'),
        expect.objectContaining({ petId: 'pet-a', matchId: 'match-1' }),
      );

      expect(notificationsService.create).toHaveBeenCalledWith(
        'owner-b',
        'dating.match-created',
        "It's a match!",
        expect.stringContaining('Bella matched with Rex'),
        expect.objectContaining({ petId: 'pet-b', matchId: 'match-1' }),
      );
    });
  });
});
