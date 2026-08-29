import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type Stripe from 'stripe';

import { TagOrder, TagOrderDocument } from './schemas/tag-order.schema';
import { CreateTagOrderDto } from './dto/create-tag-order.dto';
import { ShipTagOrderDto } from './dto/ship-tag-order.dto';
import { AdminTagOrderQueryDto } from './dto/admin-tag-order-query.dto';
import { StripeService } from './stripe.service';
import { TagsService } from '../tags/tags.service';
import { ActivityService } from '../activity/activity.service';
import { TagOrderStatus } from '../../common/enums/tag-order-status.enum';

@Injectable()
export class TagOrdersService {
  private readonly logger = new Logger(TagOrdersService.name);

  constructor(
    @InjectModel(TagOrder.name)
    private readonly tagOrderModel: Model<TagOrderDocument>,

    private readonly configService: ConfigService,
    private readonly stripeService: StripeService,
    private readonly tagsService: TagsService,
    private readonly activityService: ActivityService,
  ) {}

  async createOrder(userId: string, dto: CreateTagOrderDto) {
    const unitPriceCents = this.configService.getOrThrow<number>(
      'stripe.tagUnitPriceCents',
    );
    const currency = this.configService.getOrThrow<string>('stripe.currency');
    const totalAmountCents = dto.quantity * unitPriceCents;

    // Generated up front so it can go into the Stripe session's metadata
    // before the order document exists — avoids a two-step
    // create-then-update dance (and the resulting window where a
    // required+unique stripeCheckoutSessionId would otherwise be absent).
    const orderId = new Types.ObjectId();

    const session = await this.stripeService.createCheckoutSession({
      orderId: orderId.toString(),
      quantity: dto.quantity,
      unitPriceCents,
      currency,
    });

    const order = await this.tagOrderModel.create({
      _id: orderId,
      userId: new Types.ObjectId(userId),
      quantity: dto.quantity,
      unitPriceCents,
      totalAmountCents,
      currency,
      shippingAddress: dto.shippingAddress,
      status: TagOrderStatus.PENDING_PAYMENT,
      stripeCheckoutSessionId: session.id,
    });

    return { orderId: order._id.toString(), checkoutUrl: session.url };
  }

  // Called from the webhook controller once the signature is verified.
  // Idempotent: Stripe can (and does) redeliver the same event, and a
  // PENDING_PAYMENT guard means a second delivery is a no-op rather than
  // minting a second batch of tags for the same paid order.
  async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const orderId = session.metadata?.orderId;

    if (!orderId) {
      this.logger.warn(
        `checkout.session.completed with no orderId in metadata (session ${session.id})`,
      );
      return;
    }

    const order = await this.tagOrderModel.findById(orderId);

    if (!order) {
      this.logger.warn(`No TagOrder found for orderId ${orderId}`);
      return;
    }

    if (order.status !== TagOrderStatus.PENDING_PAYMENT) {
      return;
    }

    order.status = TagOrderStatus.PAID;
    order.stripePaymentIntentId =
      this.stripeService.extractPaymentIntentId(session);
    order.paidAt = new Date();

    await order.save();

    const frontendUrl = this.configService.get<string>('app.frontendUrl');

    await this.tagsService.mintManufacturedBatch(
      order.quantity,
      `${frontendUrl}/qr`,
      `order-${order._id.toString()}`,
    );
  }

  async findMine(userId: string) {
    return this.tagOrderModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 });
  }

  async findOne(userId: string, id: string, isAdmin: boolean) {
    const order = await this.tagOrderModel.findById(id);

    if (!order) {
      throw new NotFoundException('Tag order not found');
    }

    if (!isAdmin && !order.userId.equals(userId)) {
      throw new ForbiddenException('You do not own this order');
    }

    return order;
  }

  async adminList(query: AdminTagOrderQueryDto) {
    const { page, limit, status } = query;

    const filter = status ? { status } : {};

    const total = await this.tagOrderModel.countDocuments(filter);

    const orders = await this.tagOrderModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      orders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async adminMarkShipped(actorId: string, id: string, dto: ShipTagOrderDto) {
    const order = await this.tagOrderModel.findById(id);

    if (!order) {
      throw new NotFoundException('Tag order not found');
    }

    if (order.status !== TagOrderStatus.PAID) {
      throw new BadRequestException(
        'Only a paid order can be marked as shipped',
      );
    }

    order.status = TagOrderStatus.FULFILLED;
    order.trackingNumber = dto.trackingNumber;
    order.fulfilledAt = new Date();

    await order.save();

    await this.activityService.log(
      actorId,
      'tag-order.shipped',
      order._id.toString(),
      { trackingNumber: dto.trackingNumber },
    );

    return order;
  }
}
