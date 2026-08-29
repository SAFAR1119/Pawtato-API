import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { DatingChatNotificationService } from './dating-chat-notification.service';
import { DOMAIN_EVENTS } from '../../common/events/domain-events';
import type { DatingMessageSentEvent } from '../../common/events/domain-events';

// Turns a persisted dating message into a dedicated, unread
// DatingChatNotification for its recipient. Deliberately independent of
// DomainEventsListener (the platform's general notification system) —
// listens on the exact same DATING_MESSAGE_SENT event DatingGateway
// already reacts to, so a REST-sent or socket-sent message both produce a
// notification through this one path, but writes to a wholly separate
// collection than the general Notification one.
//
// Only ever fires after DatingService.sendMessage() has successfully
// persisted the Message (that's the only place this event is emitted, and
// only once the create() call above it has already succeeded) — a failed
// send never reaches here, so there's nothing to roll back.
@Injectable()
export class DatingChatNotificationListener {
  private readonly logger = new Logger(DatingChatNotificationListener.name);

  constructor(
    private readonly datingChatNotificationService: DatingChatNotificationService,
  ) {}

  @OnEvent(DOMAIN_EVENTS.DATING_MESSAGE_SENT)
  async onMessageSent(event: DatingMessageSentEvent) {
    const senderIsA = event.senderUserId === event.ownerAId;

    const recipientUserId = senderIsA ? event.ownerBId : event.ownerAId;
    const senderPetId = senderIsA ? event.petAId : event.petBId;
    const recipientPetId = senderIsA ? event.petBId : event.petAId;

    try {
      await this.datingChatNotificationService.createForMessage({
        recipientUserId,
        senderUserId: event.senderUserId,
        senderPetId,
        recipientPetId,
        matchId: event.matchId,
        messageId: event.messageId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create dating chat notification for message ${event.messageId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
