import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { NotificationsService } from './notifications.service';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { BulkDeleteNotificationsDto } from './dto/bulk-delete-notifications.dto';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { RegisterWebPushSubscriptionDto } from './dto/register-web-push-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  @ApiOperation({ summary: "List the current user's in-app notifications" })
  @ApiResponse({
    status: 200,
    description: 'Paginated notifications, newest first.',
  })
  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,

    @Query()
    query: NotificationQueryDto,
  ) {
    return this.notificationsService.findForUser(user.sub, query);
  }

  @ApiOperation({
    summary: "Mark all of the current user's notifications as read",
  })
  @ApiResponse({
    status: 200,
    description: 'Number of notifications updated.',
  })
  @Patch('read-all')
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.markAllRead(user.sub);
  }

  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'The updated notification.' })
  @ApiResponse({
    status: 404,
    description: 'Notification not found or not owned by the caller.',
  })
  @Patch(':id/read')
  markRead(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    notificationId: string,
  ) {
    return this.notificationsService.markRead(user.sub, notificationId);
  }

  @ApiOperation({
    summary: 'Delete multiple notifications at once, regardless of priority',
  })
  @ApiResponse({ status: 200, description: 'Number of notifications deleted.' })
  @Delete()
  deleteMany(
    @CurrentUser() user: JwtPayload,

    @Body()
    dto: BulkDeleteNotificationsDto,
  ) {
    return this.notificationsService.deleteMany(user.sub, dto.ids);
  }

  @ApiOperation({
    summary: "Register a native (FCM/APNs) push token for the caller's device",
    description:
      'For IOS/ANDROID once a native app exists — not for browsers. Idempotent per token: ' +
      're-registering the same token (e.g. after re-login) updates its owner/platform rather ' +
      'than creating a duplicate. No native provider is wired up yet (mobile apps are still ' +
      'backlog — see PAWTATO_ROADMAP.md Phase 9), so PushChannel does not act on rows created ' +
      'here. For a real browser, use POST /notifications/web-push-subscriptions instead.',
  })
  @ApiResponse({ status: 201, description: 'Device token registered.' })
  @Post('device-tokens')
  registerDeviceToken(
    @CurrentUser() user: JwtPayload,

    @Body()
    dto: RegisterDeviceTokenDto,
  ) {
    return this.notificationsService.registerDeviceToken(user.sub, dto);
  }

  @ApiOperation({
    summary: "Unregister one of the caller's device tokens",
  })
  @ApiParam({ name: 'token', description: 'The device token to remove' })
  @ApiResponse({ status: 200, description: 'Device token removed.' })
  @ApiResponse({
    status: 404,
    description: 'Device token not found or not owned by the caller.',
  })
  @Delete('device-tokens/:token')
  unregisterDeviceToken(
    @CurrentUser() user: JwtPayload,

    @Param('token')
    token: string,
  ) {
    return this.notificationsService.unregisterDeviceToken(user.sub, token);
  }

  @ApiOperation({
    summary: 'Get the VAPID public key the frontend needs to subscribe',
    description:
      'Pass this directly as `applicationServerKey` to `PushManager.subscribe()`. Not a ' +
      'secret — every subscribing browser receives it — but requires auth like the rest of ' +
      "this controller, since it's only ever needed once the user is already signed in.",
  })
  @ApiResponse({
    status: 200,
    description:
      'The base64url-encoded VAPID public key, or null if push is not configured on this server.',
  })
  @Get('vapid-public-key')
  getVapidPublicKey() {
    return {
      publicKey: this.configService.get<string>('vapid.publicKey') ?? null,
    };
  }

  @ApiOperation({
    summary: 'Register a real browser Web Push subscription for the caller',
    description:
      "Shaped to match PushSubscription.toJSON() exactly — POST the browser's subscription " +
      'object with no transformation. Idempotent per `endpoint`: re-subscribing (re-login, ' +
      'service-worker update) updates its owner rather than creating a duplicate. This is ' +
      'the endpoint that actually receives real push notifications via PushChannel.',
  })
  @ApiResponse({
    status: 201,
    description: 'Web push subscription registered.',
  })
  @Post('web-push-subscriptions')
  registerWebPushSubscription(
    @CurrentUser() user: JwtPayload,

    @Body()
    dto: RegisterWebPushSubscriptionDto,
  ) {
    return this.notificationsService.registerWebPushSubscription(user.sub, dto);
  }

  @ApiOperation({
    summary: "Unregister one of the caller's web push subscriptions",
  })
  @ApiQuery({
    name: 'endpoint',
    description: "The subscription's endpoint URL to remove",
  })
  @ApiResponse({ status: 200, description: 'Web push subscription removed.' })
  @ApiResponse({
    status: 404,
    description: 'Subscription not found or not owned by the caller.',
  })
  @Delete('web-push-subscriptions')
  unregisterWebPushSubscription(
    @CurrentUser() user: JwtPayload,

    @Query('endpoint')
    endpoint: string,
  ) {
    return this.notificationsService.unregisterWebPushSubscription(
      user.sub,
      endpoint,
    );
  }

  // Registered last among the DELETE routes deliberately: Nest/Express
  // matches routes in registration order, and a bare `:id` segment would
  // otherwise swallow every static DELETE path above it (e.g.
  // `DELETE /notifications/web-push-subscriptions` would hit this handler
  // with notificationId="web-push-subscriptions" instead of its own route)
  // — the same class of bug fixed for `GET /pets/statistics` in Phase 1.
  @ApiOperation({
    summary: 'Delete a single notification, regardless of priority',
  })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification deleted.' })
  @ApiResponse({
    status: 404,
    description: 'Notification not found or not owned by the caller.',
  })
  @Delete(':id')
  deleteOne(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    notificationId: string,
  ) {
    return this.notificationsService.delete(user.sub, notificationId);
  }
}
