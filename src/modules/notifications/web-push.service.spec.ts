import { ConfigService } from '@nestjs/config';

const sendNotificationMock = jest.fn();
const setVapidDetailsMock = jest.fn();

class FakeWebPushError extends Error {
  constructor(public readonly statusCode: number) {
    super('web-push error');
    Object.setPrototypeOf(this, FakeWebPushError.prototype);
  }
}

jest.mock('web-push', () => ({
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ): unknown => sendNotificationMock(subscription, payload),
  setVapidDetails: (
    subject: string,
    publicKey: string,
    privateKey: string,
  ): unknown => setVapidDetailsMock(subject, publicKey, privateKey),
  get WebPushError() {
    return FakeWebPushError;
  },
}));

import { WebPushService } from './web-push.service';

describe('WebPushService', () => {
  let configService: { get: jest.Mock };

  function buildService(
    overrides: Record<string, string | undefined> = {},
  ): WebPushService {
    const values: Record<string, string | undefined> = {
      'vapid.publicKey': 'a-public-key',
      'vapid.privateKey': 'a-private-key',
      'vapid.subject': 'mailto:no-reply@pawtato.app',
      ...overrides,
    };

    configService = { get: jest.fn((key: string) => values[key]) };

    return new WebPushService(configService as unknown as ConfigService);
  }

  beforeEach(() => {
    sendNotificationMock.mockReset();
    setVapidDetailsMock.mockReset();
  });

  it('should be defined', () => {
    expect(buildService()).toBeDefined();
  });

  describe('isConfigured', () => {
    it('is true and sets VAPID details when all three env vars are present', () => {
      const service = buildService();

      expect(service.isConfigured()).toBe(true);
      expect(setVapidDetailsMock).toHaveBeenCalledWith(
        'mailto:no-reply@pawtato.app',
        'a-public-key',
        'a-private-key',
      );
    });

    it('is false and does not call setVapidDetails when any key is missing', () => {
      const service = buildService({ 'vapid.privateKey': undefined });

      expect(service.isConfigured()).toBe(false);
      expect(setVapidDetailsMock).not.toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('delegates to the web-push SDK with the subscription and payload', async () => {
      const service = buildService();
      sendNotificationMock.mockResolvedValue(undefined);

      const subscription = {
        endpoint: 'https://push.example.com/abc',
        keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
      };

      await service.send(subscription, '{"title":"hi"}');

      expect(sendNotificationMock).toHaveBeenCalledWith(
        subscription,
        '{"title":"hi"}',
      );
    });
  });

  describe('isGoneError', () => {
    it('is true for a WebPushError with status 404 or 410', () => {
      const service = buildService();

      expect(service.isGoneError(new FakeWebPushError(404))).toBe(true);
      expect(service.isGoneError(new FakeWebPushError(410))).toBe(true);
    });

    it('is false for a WebPushError with any other status', () => {
      const service = buildService();

      expect(service.isGoneError(new FakeWebPushError(500))).toBe(false);
    });

    it('is false for a non-WebPushError value', () => {
      const service = buildService();

      expect(service.isGoneError(new Error('network blip'))).toBe(false);
      expect(service.isGoneError('not even an error')).toBe(false);
    });
  });
});
