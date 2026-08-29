import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { DatingService } from './dating.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DiscoverQueryDto } from './dto/discover-query.dto';
import { SwipeDto } from './dto/swipe.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateDatingReportDto } from './dto/create-dating-report.dto';

@ApiTags('Dating')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('dating')
export class DatingController {
  constructor(private readonly datingService: DatingService) {}

  @ApiOperation({
    summary: "Get a pet's full dating profile",
    description:
      'Used for "View full profile" (a discover candidate) and the Matched Profile Detail screen. ' +
      'Viewable by anyone while the profile is active; the owner can also view it while paused.',
  })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'The dating profile.' })
  @ApiResponse({
    status: 404,
    description:
      'No dating profile for this pet, or it is inactive and the caller does not own it.',
  })
  @Get('profiles/:petId')
  getProfile(
    @CurrentUser() user: JwtPayload,
    @Param('petId', ParseMongoIdPipe) petId: string,
  ) {
    return this.datingService.getProfile(user.sub, petId);
  }

  @ApiOperation({
    summary: 'Discover candidate pets to swipe on in a given mode',
    description:
      'BREEDING candidates are always the same species as the swiping pet; PLAYDATE candidates ' +
      "are never species-restricted. Excludes the caller's own pets and anything already swiped " +
      'in this mode, active + mode-enabled profiles only. `verifiedOnly` further restricts to ' +
      "owners who are identity-verified, and requires the caller's own verification to be approved.",
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of candidate profiles.',
  })
  @ApiResponse({
    status: 400,
    description:
      "The swiping pet has no active profile, doesn't have this mode enabled, or verifiedOnly was requested by an unverified caller.",
  })
  @Get('discover')
  discover(@CurrentUser() user: JwtPayload, @Query() query: DiscoverQueryDto) {
    return this.datingService.discover(user.sub, query);
  }

  @ApiOperation({
    summary: 'Swipe on another pet within a given mode',
    description:
      'A mutual LIKE (in the same mode) immediately creates and returns a Match — no polling ' +
      'needed. Mode-enabled status and (for BREEDING) species compatibility are enforced here ' +
      'too, not just in discover().',
  })
  @ApiResponse({
    status: 201,
    description:
      'Swipe recorded; `match` is non-null only on a new mutual LIKE.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Already swiped on this pet in this mode, mode not enabled on one side, BREEDING species mismatch, or an inactive profile.',
  })
  @Throttle({ swipe: { limit: 60, ttl: 60_000 } })
  @Post('swipe')
  swipe(@CurrentUser() user: JwtPayload, @Body() dto: SwipeDto) {
    return this.datingService.swipe(user.sub, dto);
  }

  @ApiOperation({ summary: "List all of the caller's active matches" })
  @ApiResponse({ status: 200, description: 'Array of active matches.' })
  @Get('matches')
  listMatches(@CurrentUser() user: JwtPayload) {
    return this.datingService.listMatches(user.sub);
  }

  @ApiOperation({ summary: 'List messages in a match' })
  @ApiParam({ name: 'matchId', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Messages, oldest first.' })
  @ApiResponse({
    status: 404,
    description: 'Match not found, or the caller owns neither side.',
  })
  @Get('matches/:matchId/messages')
  listMessages(
    @CurrentUser() user: JwtPayload,
    @Param('matchId', ParseMongoIdPipe) matchId: string,
  ) {
    return this.datingService.listMessages(user.sub, matchId);
  }

  @ApiOperation({ summary: 'Send a message in a match' })
  @ApiParam({ name: 'matchId', description: 'Match ID' })
  @ApiResponse({ status: 201, description: 'Message sent.' })
  @ApiResponse({ status: 400, description: 'This match has already ended.' })
  @ApiResponse({
    status: 404,
    description: 'Match not found, or the caller owns neither side.',
  })
  @Post('matches/:matchId/messages')
  sendMessage(
    @CurrentUser() user: JwtPayload,
    @Param('matchId', ParseMongoIdPipe) matchId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.datingService.sendMessage(user.sub, matchId, dto);
  }

  @ApiOperation({
    summary: 'Mark a conversation as read',
    description:
      'Deletes every unread DatingChatNotification the caller has for this match — this is a ' +
      'dedicated system, entirely separate from the general Notifications API, that only tracks ' +
      'unread dating-chat messages. "Read" means the notification row no longer exists, not a ' +
      'flag flip.',
  })
  @ApiParam({ name: 'matchId', description: 'Match ID' })
  @ApiResponse({
    status: 201,
    description:
      'Number of unread notifications deleted for this conversation.',
  })
  @ApiResponse({
    status: 404,
    description: 'Match not found, or the caller owns neither side.',
  })
  @Post('matches/:matchId/read')
  markChatRead(
    @CurrentUser() user: JwtPayload,
    @Param('matchId', ParseMongoIdPipe) matchId: string,
  ) {
    return this.datingService.markChatRead(user.sub, matchId);
  }

  @ApiOperation({ summary: 'Unmatch — either side can end it' })
  @ApiParam({ name: 'matchId', description: 'Match ID' })
  @ApiResponse({ status: 201, description: 'Unmatched successfully.' })
  @ApiResponse({
    status: 404,
    description: 'Match not found, or the caller owns neither side.',
  })
  @Post('matches/:matchId/unmatch')
  unmatch(
    @CurrentUser() user: JwtPayload,
    @Param('matchId', ParseMongoIdPipe) matchId: string,
  ) {
    return this.datingService.unmatch(user.sub, matchId);
  }

  @ApiOperation({
    summary:
      "Delete a conversation (hides it from the caller's own matches/messages view)",
    description:
      'Requires the match to already be unmatched — unmatch first. Never deletes the underlying ' +
      "messages: the other side (if they haven't also deleted it) still sees the conversation, " +
      'and a filed report can still be reviewed with full chat context.',
  })
  @ApiParam({ name: 'matchId', description: 'Match ID' })
  @ApiResponse({ status: 201, description: 'Conversation deleted.' })
  @ApiResponse({
    status: 400,
    description: 'The match is still active — unmatch before deleting.',
  })
  @ApiResponse({
    status: 404,
    description: 'Match not found, or the caller owns neither side.',
  })
  @Post('matches/:matchId/delete')
  deleteChat(
    @CurrentUser() user: JwtPayload,
    @Param('matchId', ParseMongoIdPipe) matchId: string,
  ) {
    return this.datingService.deleteChat(user.sub, matchId);
  }

  @ApiOperation({
    summary: "Share the caller's identity (NID) within a specific match",
    description:
      'Explicit, per-match consent (not automatic on match) — requires the caller to be ' +
      'identity-verified (APPROVED). Sharing is per-direction: this only ever affects what the ' +
      'other side of this match can view, and only within this match.',
  })
  @ApiParam({ name: 'matchId', description: 'Match ID' })
  @ApiResponse({ status: 201, description: 'Identity shared in this match.' })
  @ApiResponse({
    status: 400,
    description: 'Caller is not identity-verified.',
  })
  @ApiResponse({
    status: 404,
    description: 'Match not found, or the caller owns neither side.',
  })
  @Post('matches/:matchId/share-nid')
  shareNid(
    @CurrentUser() user: JwtPayload,
    @Param('matchId', ParseMongoIdPipe) matchId: string,
  ) {
    return this.datingService.shareNid(user.sub, matchId);
  }

  @ApiOperation({
    summary:
      "View the other side's identity (NID), if they've shared it in this match",
    description:
      'Returns short-lived signed URLs, never a permanent link. Requires the caller to also be ' +
      'identity-verified, and the other side to have both shared (share-nid) and still be ' +
      'currently APPROVED. Every call is audit-logged (`dating.nid.viewed`).',
  })
  @ApiParam({ name: 'matchId', description: 'Match ID' })
  @ApiResponse({
    status: 200,
    description: 'Short-lived signed URLs to the front/back NID images.',
  })
  @ApiResponse({
    status: 400,
    description:
      "Caller isn't verified, or the other side hasn't shared / is no longer verified.",
  })
  @ApiResponse({
    status: 404,
    description: 'Match not found, or the caller owns neither side.',
  })
  @Get('matches/:matchId/nid')
  getNidExchange(
    @CurrentUser() user: JwtPayload,
    @Param('matchId', ParseMongoIdPipe) matchId: string,
  ) {
    return this.datingService.getNidExchange(user.sub, matchId);
  }

  @ApiOperation({
    summary: "Report a pet's dating profile, optionally with chat context",
    description:
      'Set `matchId` when reporting from inside a conversation (e.g. harassment in messages) so ' +
      'admin can review the actual chat, not just the profile. The caller must own one side of ' +
      'that match, and targetPetId must be the other side.',
  })
  @ApiResponse({ status: 201, description: 'Report submitted.' })
  @ApiResponse({
    status: 404,
    description:
      'Pet not found, it has no dating profile, or (with matchId) the match was not found / the caller owns neither side.',
  })
  @ApiResponse({
    status: 400,
    description: 'targetPetId is not the other side of the given matchId.',
  })
  @Post('report')
  report(@CurrentUser() user: JwtPayload, @Body() dto: CreateDatingReportDto) {
    return this.datingService.report(user.sub, dto);
  }
}
