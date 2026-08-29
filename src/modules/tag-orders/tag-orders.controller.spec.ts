import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { TagOrdersController } from './tag-orders.controller';
import { TagOrdersService } from './tag-orders.service';
import { StripeService } from './stripe.service';
import { UserRole } from '../../common/enums/user-role.enum';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

describe('TagOrdersController', () => {
  let controller: TagOrdersController;
  let tagOrdersService: {
    createOrder: jest.Mock;
    findMine: jest.Mock;
    findOne: jest.Mock;
    handleCheckoutCompleted: jest.Mock;
  };
  let stripeService: { constructWebhookEvent: jest.Mock };

  const user = { sub: 'user-1', role: UserRole.USER } as JwtPayload;

  beforeEach(async () => {
    tagOrdersService = {
      createOrder: jest.fn(),
      findMine: jest.fn(),
      findOne: jest.fn(),
      handleCheckoutCompleted: jest.fn().mockResolvedValue(undefined),
    };
    stripeService = { constructWebhookEvent: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TagOrdersController],
      providers: [
        { provide: TagOrdersService, useValue: tagOrdersService },
        { provide: StripeService, useValue: stripeService },
      ],
    }).compile();

    controller = module.get<TagOrdersController>(TagOrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findOne', () => {
    it('passes isAdmin=true for an ADMIN caller', async () => {
      const admin = { sub: 'admin-1', role: UserRole.ADMIN } as JwtPayload;

      await controller.findOne(admin, 'order-1');

      expect(tagOrdersService.findOne).toHaveBeenCalledWith(
        'admin-1',
        'order-1',
        true,
      );
    });

    it('passes isAdmin=false for a regular caller', async () => {
      await controller.findOne(user, 'order-1');

      expect(tagOrdersService.findOne).toHaveBeenCalledWith(
        'user-1',
        'order-1',
        false,
      );
    });
  });

  describe('handleWebhook', () => {
    it('throws BadRequestException when the request has no rawBody', async () => {
      await expect(
        controller.handleWebhook({ rawBody: undefined } as never, 'sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when signature verification fails', async () => {
      stripeService.constructWebhookEvent.mockImplementation(() => {
        throw new Error('bad signature');
      });

      await expect(
        controller.handleWebhook(
          { rawBody: Buffer.from('{}') } as never,
          'sig',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('handles checkout.session.completed and acknowledges receipt', async () => {
      stripeService.constructWebhookEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_123' } },
      });

      const result = await controller.handleWebhook(
        { rawBody: Buffer.from('{}') } as never,
        'sig',
      );

      expect(tagOrdersService.handleCheckoutCompleted).toHaveBeenCalledWith({
        id: 'cs_123',
      });
      expect(result).toEqual({ received: true });
    });

    it('ignores event types other than checkout.session.completed', async () => {
      stripeService.constructWebhookEvent.mockReturnValue({
        type: 'payment_intent.created',
        data: { object: {} },
      });

      await controller.handleWebhook(
        { rawBody: Buffer.from('{}') } as never,
        'sig',
      );

      expect(tagOrdersService.handleCheckoutCompleted).not.toHaveBeenCalled();
    });
  });
});
