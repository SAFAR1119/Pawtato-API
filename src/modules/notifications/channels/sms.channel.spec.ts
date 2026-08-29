import { Test, TestingModule } from '@nestjs/testing';
import { SmsChannel } from './sms.channel';
import { DOMAIN_EVENTS } from '../../../common/events/domain-events';

describe('SmsChannel', () => {
  let channel: SmsChannel;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SmsChannel],
    }).compile();

    channel = module.get<SmsChannel>(SmsChannel);
  });

  it('should be defined', () => {
    expect(channel).toBeDefined();
  });

  it('does nothing when the payload has no ownerPhone', async () => {
    await expect(
      channel.send('user-1', DOMAIN_EVENTS.FOUND_REPORT_CREATED, {
        petName: 'Rex',
      }),
    ).resolves.toBeUndefined();
  });

  it('does nothing for an event type that does not opt into SMS', async () => {
    const logSpy = jest.spyOn(channel['logger'], 'log');

    await channel.send('user-1', DOMAIN_EVENTS.PET_MARKED_LOST, {
      petName: 'Rex',
      ownerPhone: '+8801XXXXXXXXX',
    });

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs the stub send for an event type that opts into SMS', async () => {
    const logSpy = jest.spyOn(channel['logger'], 'log');

    await channel.send('user-1', DOMAIN_EVENTS.FOUND_REPORT_CREATED, {
      petName: 'Rex',
      ownerPhone: '+8801XXXXXXXXX',
      message: 'Found near the park',
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('+8801XXXXXXXXX'),
    );
  });
});
