import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { DatingService } from './dating.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { DOMAIN_EVENTS } from '../../common/events/domain-events';
import type {
  DatingMatchCreatedEvent,
  DatingMatchUnmatchedEvent,
  DatingMessageSentEvent,
} from '../../common/events/domain-events';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

function matchRoom(matchId: string): string {
  return `match:${matchId}`;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

interface SocketData {
  userId: string;
}

// `Socket.data` is typed `any` by socket.io's default generic — this is the
// one, explicit cast point so every other access below is type-safe rather
// than repeating an unsafe `.data.userId` member access at each call site.
function socketData(client: Socket): SocketData {
  return client.data as SocketData;
}

// Real-time signaling layer for matched chat (Phase 12). This never replaces
// the REST endpoints on DatingController — GET .../messages is still how a
// client loads history, and POST .../messages still works with no socket
// connection at all (e.g. push-notification-only clients). This gateway is
// purely additive: it pushes newMessage/matchCreated/matchUnmatched events
// live to anyone connected, and offers a lower-latency `sendMessage` socket
// event that calls the exact same DatingService.sendMessage() the REST
// endpoint does — same validation, same persisted row, same emitted domain
// event — so a REST-sent message still reaches a socket-connected recipient
// instantly, and a socket-sent message is identical to a REST one at rest.
//
// Deployment note: Socket.IO's default in-memory adapter only broadcasts
// within a single Node process. Horizontally-scaled instances would need a
// shared adapter (e.g. @socket.io/redis-adapter) for a message published on
// one instance to reach a client connected to another — the same class of
// caveat already documented for the Phase 8 in-memory throttler storage.
// Out of scope for a single-instance deployment.
@WebSocketGateway({
  namespace: '/dating',
  cors: { origin: true, credentials: true },
})
export class DatingGateway implements OnGatewayConnection {
  private readonly logger = new Logger(DatingGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly datingService: DatingService,
  ) {}

  // Auth happens once, at connection time — a socket that fails JWT
  // verification (missing/expired/invalid token) is disconnected
  // immediately, the same "no anonymous access" guarantee JwtAuthGuard
  // gives every REST dating/ endpoint. Every event handler below trusts
  // `client.data.userId`, never re-reads the token.
  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

      socketData(client).userId = payload.sub;
      await client.join(userRoom(payload.sub));
    } catch {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  private extractToken(client: Socket): string {
    const authToken = client.handshake.auth?.token as string | undefined;
    const header = client.handshake.headers.authorization;
    const bearerToken =
      typeof header === 'string'
        ? header.replace(/^Bearer\s+/i, '')
        : undefined;
    const token = authToken ?? bearerToken;

    if (!token) {
      throw new Error('No token provided');
    }

    return token;
  }

  // Joining a match's room is itself ownership-checked — a socket cannot
  // listen to a match it doesn't own a side of, same IDOR-safe guarantee
  // as every REST match-scoped route (see DatingService.assertCanAccessMatch).
  @SubscribeMessage('joinMatch')
  async joinMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { matchId?: string },
  ) {
    const userId = socketData(client).userId;

    if (!body?.matchId) {
      client.emit('error', { message: 'matchId is required' });
      return;
    }

    try {
      await this.datingService.assertCanAccessMatch(userId, body.matchId);
    } catch {
      client.emit('error', { message: 'Match not found' });
      return;
    }

    await client.join(matchRoom(body.matchId));
    client.emit('joinedMatch', { matchId: body.matchId });
  }

  @SubscribeMessage('leaveMatch')
  async leaveMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { matchId?: string },
  ) {
    if (body?.matchId) {
      await client.leave(matchRoom(body.matchId));
    }
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { matchId?: string; content?: string },
  ) {
    const userId = socketData(client).userId;

    if (!body?.matchId || !body?.content) {
      client.emit('error', { message: 'matchId and content are required' });
      return;
    }

    const dto = new CreateMessageDto();
    dto.content = body.content;

    try {
      await this.datingService.sendMessage(userId, body.matchId, dto);
      // No direct broadcast here — the DATING_MESSAGE_SENT listener below
      // does that, so a socket-sent message and a REST-sent one broadcast
      // through exactly one code path.
    } catch (error) {
      client.emit('error', {
        message: error instanceof Error ? error.message : 'Send failed',
      });
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { matchId?: string },
  ) {
    if (!body?.matchId) {
      return;
    }

    client.to(matchRoom(body.matchId)).emit('typing', {
      matchId: body.matchId,
      userId: socketData(client).userId,
    });
  }

  @OnEvent(DOMAIN_EVENTS.DATING_MATCH_CREATED)
  handleMatchCreated(event: DatingMatchCreatedEvent) {
    this.server.to(userRoom(event.ownerAId)).emit('matchCreated', event);
    this.server.to(userRoom(event.ownerBId)).emit('matchCreated', event);
  }

  @OnEvent(DOMAIN_EVENTS.DATING_MESSAGE_SENT)
  handleMessageSent(event: DatingMessageSentEvent) {
    // Match room: for whoever has the chat thread open right now.
    this.server.to(matchRoom(event.matchId)).emit('newMessage', event);
    // Personal rooms too: so a "new message" badge can update even when
    // neither side currently has that specific chat thread open.
    this.server.to(userRoom(event.ownerAId)).emit('newMessage', event);
    this.server.to(userRoom(event.ownerBId)).emit('newMessage', event);
  }

  @OnEvent(DOMAIN_EVENTS.DATING_MATCH_UNMATCHED)
  handleMatchUnmatched(event: DatingMatchUnmatchedEvent) {
    this.server.to(matchRoom(event.matchId)).emit('matchUnmatched', event);
    this.server.to(userRoom(event.ownerAId)).emit('matchUnmatched', event);
    this.server.to(userRoom(event.ownerBId)).emit('matchUnmatched', event);
  }
}
