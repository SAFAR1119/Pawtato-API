import { Test, TestingModule } from '@nestjs/testing';
import { EmailChannel } from './email.channel';
import { NotificationsService } from '../notifications.service';

describe('EmailChannel', () => {
  let channel: EmailChannel;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailChannel,
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();

    channel = module.get<EmailChannel>(EmailChannel);
  });

  it('should be defined', () => {
    expect(channel).toBeDefined();
  });
});
