import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { TagOrdersService } from './tag-orders.service';
import { StripeService } from './stripe.service';
import { CreateTagOrderDto } from './dto/create-tag-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('Tag Orders')
@Controller('tag-orders')
export class TagOrdersController {
  constructor(
    private readonly tagOrdersService: TagOrdersService,
    private readonly stripeService: StripeService,
  ) {}

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Order physical QR tags, starting a Stripe Checkout session',
    description:
      'Returns a Stripe-hosted checkout URL — redirect the caller there to pay. The order stays ' +
      'PENDING_PAYMENT until Stripe confirms payment via the webhook; no tags exist yet at this point.',
  })
  @ApiResponse({
    status: 201,
    description: 'Order created; redirect the caller to checkoutUrl.',
  })
  @ApiResponse({
    status: 503,
    description: 'Tag ordering is not configured on this server.',
  })
  @Post()
  createOrder(
    @CurrentUser() user: JwtPayload,

    @Body()
    dto: CreateTagOrderDto,
  ) {
    return this.tagOrdersService.createOrder(user.sub, dto);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "List the caller's own tag orders" })
  @ApiResponse({ status: 200, description: "The caller's tag orders." })
  @Get('mine')
  findMine(@CurrentUser() user: JwtPayload) {
    return this.tagOrdersService.findMine(user.sub);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a single tag order (owner or admin only)' })
  @ApiParam({ name: 'id', description: 'Tag order ID' })
  @ApiResponse({ status: 200, description: 'The tag order.' })
  @ApiResponse({
    status: 404,
    description: 'Tag order not found.',
  })
  @Get(':id')
  findOne(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    id: string,
  ) {
    return this.tagOrdersService.findOne(
      user.sub,
      id,
      (user.role as UserRole) === UserRole.ADMIN,
    );
  }

  @ApiOperation({
    summary: 'Stripe webhook — do not call directly',
    description:
      'Verified via the `Stripe-Signature` header against STRIPE_WEBHOOK_SECRET, not user-' +
      'authenticated. On `checkout.session.completed`, marks the matching order PAID and mints ' +
      'its physical Tag inventory (MANUFACTURED status, ready for the usual admin fulfillment flow).',
  })
  @ApiResponse({ status: 200, description: 'Event processed.' })
  @ApiResponse({
    status: 400,
    description: 'Missing or invalid Stripe-Signature.',
  })
  @Post('webhook')
  async handleWebhook(
    @Req()
    request: RawBodyRequest<Request>,

    @Headers('stripe-signature')
    signature: string,
  ) {
    if (!request.rawBody || !signature) {
      throw new BadRequestException('Missing Stripe signature or body');
    }

    let event: Stripe.Event;

    try {
      event = this.stripeService.constructWebhookEvent(
        request.rawBody,
        signature,
      );
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    if (event.type === 'checkout.session.completed') {
      await this.tagOrdersService.handleCheckoutCompleted(event.data.object);
    }

    return { received: true };
  }
}
