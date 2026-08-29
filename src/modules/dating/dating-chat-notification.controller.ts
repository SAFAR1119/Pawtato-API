import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { DatingChatNotificationService } from './dating-chat-notification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

// Read-only surface for the Dating -> Match & Chats unread badges. Always
// scoped to the authenticated caller — there is no way to pass another
// user's id in, by design (see class docs on DatingChatNotificationService).
// Marking a conversation read lives on DatingController instead
// (`POST /dating/matches/:matchId/read`), alongside every other
// match-scoped action (messages, unmatch, delete, share-nid).
@ApiTags('Dating Notifications')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('dating/notifications')
export class DatingChatNotificationController {
  constructor(
    private readonly datingChatNotificationService: DatingChatNotificationService,
  ) {}

  @ApiOperation({
    summary:
      'Unread dating-chat counts, for the Dating and Match & Chats badges',
    description:
      'Lightweight COUNT query — never loads the underlying notifications or messages. ' +
      'Backed entirely by DatingChatNotification, never the general Notification collection.',
  })
  @ApiResponse({
    status: 200,
    description: 'Total unread dating-chat messages for the caller.',
  })
  @Get('unread-summary')
  getUnreadSummary(@CurrentUser() user: JwtPayload) {
    return this.datingChatNotificationService.getUnreadSummary(user.sub);
  }

  @ApiOperation({
    summary:
      'Unread dating chats, one entry per conversation with unread messages',
    description:
      'Grouped and counted DB-side. Returns only what the Match & Chats list needs to render ' +
      'per-pet unread state — never full message content or chat history.',
  })
  @ApiResponse({
    status: 200,
    description:
      'One entry per conversation that currently has unread messages.',
  })
  @Get()
  listUnread(@CurrentUser() user: JwtPayload) {
    return this.datingChatNotificationService.listUnreadConversations(user.sub);
  }
}
