import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { DevicePlatform } from '../../common/enums/device-platform.enum';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notificationsService: {
    registerDeviceToken: jest.Mock;
    unregisterDeviceToken: jest.Mock;
    registerWebPushSubscription: jest.Mock;
    unregisterWebPushSubscription: jest.Mock;
  };
  let configService: { get: jest.Mock };

  const user = { sub: 'user-1' } as JwtPayload;

  beforeEach(async () => {
    notificationsService = {
      registerDeviceToken: jest.fn(),
      unregisterDeviceToken: jest.fn(),
      registerWebPushSubscription: jest.fn(),
      unregisterWebPushSubscription: jest.fn(),
    };
    configService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('registerDeviceToken', () => {
    it("delegates to the service with the caller's id", async () => {
      const dto = { token: 'abc', platform: DevicePlatform.WEB };

      await controller.registerDeviceToken(user, dto);

      expect(notificationsService.registerDeviceToken).toHaveBeenCalledWith(
        'user-1',
        dto,
      );
    });
  });

  describe('unregisterDeviceToken', () => {
    it("delegates to the service with the caller's id and the token", async () => {
      await controller.unregisterDeviceToken(user, 'abc');

      expect(notificationsService.unregisterDeviceToken).toHaveBeenCalledWith(
        'user-1',
        'abc',
      );
    });
  });

  describe('getVapidPublicKey', () => {
    it('returns the configured VAPID public key', () => {
      configService.get.mockReturnValue('a-public-key');

      expect(controller.getVapidPublicKey()).toEqual({
        publicKey: 'a-public-key',
      });
      expect(configService.get).toHaveBeenCalledWith('vapid.publicKey');
    });

    it('returns null when push is not configured', () => {
      configService.get.mockReturnValue(undefined);

      expect(controller.getVapidPublicKey()).toEqual({ publicKey: null });
    });
  });

  describe('registerWebPushSubscription', () => {
    it("delegates to the service with the caller's id", async () => {
      const dto = {
        endpoint: 'https://push.example.com/abc',
        keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
      };

      await controller.registerWebPushSubscription(user, dto);

      expect(
        notificationsService.registerWebPushSubscription,
      ).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('unregisterWebPushSubscription', () => {
    it("delegates to the service with the caller's id and the endpoint", async () => {
      await controller.unregisterWebPushSubscription(
        user,
        'https://push.example.com/abc',
      );

      expect(
        notificationsService.unregisterWebPushSubscription,
      ).toHaveBeenCalledWith('user-1', 'https://push.example.com/abc');
    });
  });
});
