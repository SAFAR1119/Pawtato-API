import { Test, TestingModule } from '@nestjs/testing';

import { PushChannel } from './push.channel';
import { NotificationsService } from '../notifications.service';
import { WebPushService } from '../web-push.service';
import { DOMAIN_EVENTS } from '../../../common/events/domain-events';
import { DevicePlatform } from '../../../common/enums/device-platform.enum';

describe('PushChannel', () => {
  let channel: PushChannel;
  let notificationsService: {
    getDeviceTokens: jest.Mock;
    removeDeviceTokenByEndpoint: jest.Mock;
  };
  let webPushService: {
    isConfigured: jest.Mock;
    send: jest.Mock;
    isGoneError: jest.Mock;
  };

  const webSubscription = {
    platform: DevicePlatform.WEB,
    endpoint: 'https://push.example.com/device-1',
    p256dh: 'p256dh-value',
    authSecret: 'auth-value',
  };

  beforeEach(async () => {
    notificationsService = {
      getDeviceTokens: jest.fn(),
      removeDeviceTokenByEndpoint: jest.fn(),
    };
    webPushService = {
      isConfigured: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue(undefined),
      isGoneError: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushChannel,
        { provide: NotificationsService, useValue: notificationsService },
        { provide: WebPushService, useValue: webPushService },
      ],
    }).compile();

    channel = module.get<PushChannel>(PushChannel);
  });

  it('should be defined', () => {
    expect(channel).toBeDefined();
  });

  it('does nothing for an event type that does not opt into push, without looking up tokens', async () => {
    await channel.send('user-1', DOMAIN_EVENTS.TAG_ASSIGNED, {
      petName: 'Rex',
    });

    expect(notificationsService.getDeviceTokens).not.toHaveBeenCalled();
  });

  it('skips sending when web push is not configured, without throwing', async () => {
    webPushService.isConfigured.mockReturnValue(false);

    await channel.send('user-1', DOMAIN_EVENTS.PET_MARKED_LOST, {
      petName: 'Rex',
    });

    expect(notificationsService.getDeviceTokens).not.toHaveBeenCalled();
    expect(webPushService.send).not.toHaveBeenCalled();
  });

  it('does nothing when the user has no registered devices', async () => {
    notificationsService.getDeviceTokens.mockResolvedValue([]);

    await channel.send('user-1', DOMAIN_EVENTS.PET_MARKED_LOST, {
      petName: 'Rex',
    });

    expect(webPushService.send).not.toHaveBeenCalled();
  });

  it('ignores a native (IOS/ANDROID) device row — no provider wired up for those yet', async () => {
    notificationsService.getDeviceTokens.mockResolvedValue([
      { platform: DevicePlatform.ANDROID, token: 'fcm-token' },
    ]);

    await channel.send('user-1', DOMAIN_EVENTS.PET_MARKED_LOST, {
      petName: 'Rex',
    });

    expect(webPushService.send).not.toHaveBeenCalled();
  });

  it('sends a real web-push notification for each WEB subscription on an opted-in event type', async () => {
    notificationsService.getDeviceTokens.mockResolvedValue([webSubscription]);

    await channel.send('user-1', DOMAIN_EVENTS.FOUND_REPORT_CREATED, {
      petName: 'Rex',
      petId: 'pet-1',
      message: 'Found near the park.',
    });

    expect(webPushService.send).toHaveBeenCalledTimes(1);
    const [subscription, payload] = webPushService.send.mock.calls[0] as [
      { endpoint: string; keys: { p256dh: string; auth: string } },
      string,
    ];
    expect(subscription).toEqual({
      endpoint: webSubscription.endpoint,
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    });

    const parsed = JSON.parse(payload) as {
      title: string;
      body: string;
      tag: string;
      data: { type: string; petId?: string };
    };
    expect(parsed.title).toBe('Someone may have found your pet!');
    expect(parsed.tag).toBe(DOMAIN_EVENTS.FOUND_REPORT_CREATED);
    expect(parsed.data).toEqual({
      type: DOMAIN_EVENTS.FOUND_REPORT_CREATED,
      petId: 'pet-1',
    });
  });

  it('removes the device token when the push service reports the subscription gone', async () => {
    notificationsService.getDeviceTokens.mockResolvedValue([webSubscription]);
    webPushService.send.mockRejectedValue(new Error('gone'));
    webPushService.isGoneError.mockReturnValue(true);

    await channel.send('user-1', DOMAIN_EVENTS.PET_MARKED_LOST, {
      petName: 'Rex',
    });

    expect(
      notificationsService.removeDeviceTokenByEndpoint,
    ).toHaveBeenCalledWith(webSubscription.endpoint);
  });

  it('logs and leaves the subscription in place for a non-gone delivery failure', async () => {
    notificationsService.getDeviceTokens.mockResolvedValue([webSubscription]);
    webPushService.send.mockRejectedValue(new Error('server error'));
    webPushService.isGoneError.mockReturnValue(false);
    const errorSpy = jest.spyOn(channel['logger'], 'error');

    await channel.send('user-1', DOMAIN_EVENTS.PET_MARKED_LOST, {
      petName: 'Rex',
    });

    expect(
      notificationsService.removeDeviceTokenByEndpoint,
    ).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});
