import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

const createMock = jest.fn();
const constructEventMock = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: createMock } },
    webhooks: { constructEvent: constructEventMock },
  }));
});

import { StripeService } from './stripe.service';

describe('StripeService', () => {
  let service: StripeService;
  let configService: { get: jest.Mock; getOrThrow: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'stripe.secretKey': 'sk_test_123',
          'stripe.webhookSecret': 'whsec_123',
          'app.frontendUrl': 'https://app.pawtato.com',
        };
        return values[key];
      }),
      getOrThrow: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCheckoutSession', () => {
    it('creates a payment-mode session with the orderId in metadata', async () => {
      createMock.mockResolvedValue({ id: 'cs_123', url: 'https://checkout' });

      const session = await service.createCheckoutSession({
        orderId: 'order-1',
        quantity: 3,
        unitPriceCents: 999,
        currency: 'usd',
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          metadata: { orderId: 'order-1' },
        }),
      );
      expect(session.id).toBe('cs_123');
    });
  });

  describe('getClient / configuration guard', () => {
    it('throws ServiceUnavailableException when STRIPE_SECRET_KEY is unset', async () => {
      configService.get.mockReturnValue(undefined);

      await expect(
        service.createCheckoutSession({
          orderId: 'order-1',
          quantity: 1,
          unitPriceCents: 999,
          currency: 'usd',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('constructWebhookEvent', () => {
    it('throws ServiceUnavailableException when STRIPE_WEBHOOK_SECRET is unset', () => {
      configService.get.mockImplementation((key: string) =>
        key === 'stripe.secretKey' ? 'sk_test_123' : undefined,
      );

      expect(() =>
        service.constructWebhookEvent(Buffer.from('{}'), 'sig'),
      ).toThrow(ServiceUnavailableException);
    });

    it('delegates signature verification to the Stripe SDK', () => {
      constructEventMock.mockReturnValue({
        type: 'checkout.session.completed',
      });

      const event = service.constructWebhookEvent(Buffer.from('{}'), 'sig');

      expect(constructEventMock).toHaveBeenCalledWith(
        Buffer.from('{}'),
        'sig',
        'whsec_123',
      );
      expect(event.type).toBe('checkout.session.completed');
    });
  });

  describe('extractPaymentIntentId', () => {
    it('returns the id directly when payment_intent is a string', () => {
      expect(
        service.extractPaymentIntentId({
          payment_intent: 'pi_123',
        } as never),
      ).toBe('pi_123');
    });

    it('returns .id when payment_intent is an expanded object', () => {
      expect(
        service.extractPaymentIntentId({
          payment_intent: { id: 'pi_456' },
        } as never),
      ).toBe('pi_456');
    });
  });
});
