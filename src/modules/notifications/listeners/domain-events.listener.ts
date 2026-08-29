import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { DOMAIN_EVENTS } from '../../../common/events/domain-events';
import type {
  DatingMatchCreatedEvent,
  FoundReportCreatedEvent,
  PetMarkedFoundEvent,
  PetMarkedLostEvent,
  QrTagScannedEvent,
  TagAssignedEvent,
  TagUnassignedEvent,
  VaccinationReminderDueEvent,
} from '../../../common/events/domain-events';
import { NotificationsService } from '../notifications.service';
import { NotificationChannel } from '../interfaces/notification-channel.interface';
import { NOTIFICATION_CHANNELS } from '../notifications.constants';
import { renderNotification } from '../templates/notification-templates';

// The single place that turns a domain event into (a) a persisted in-app
// Notification and (b) a fan-out to every registered channel. Every module
// that emits one of these events stays fully unaware this file exists.
@Injectable()
export class DomainEventsListener {
  private readonly logger = new Logger(DomainEventsListener.name);

  constructor(
    private readonly notificationsService: NotificationsService,

    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: NotificationChannel[],
  ) {}

  private async handle(
    type: string,
    ownerId: string,
    payload: Record<string, unknown>,
  ) {
    const { title, message } = renderNotification(type, payload);

    try {
      await this.notificationsService.create(
        ownerId,
        type,
        title,
        message,
        payload,
      );
    } catch (error) {
      this.logger.error(
        `Failed to persist notification for event "${type}"`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    await Promise.all(
      this.channels.map((channel) => channel.send(ownerId, type, payload)),
    );
  }

  @OnEvent(DOMAIN_EVENTS.PET_MARKED_LOST)
  async onPetMarkedLost(event: PetMarkedLostEvent) {
    await this.handle(DOMAIN_EVENTS.PET_MARKED_LOST, event.ownerId, {
      ...event,
    });
  }

  @OnEvent(DOMAIN_EVENTS.PET_MARKED_FOUND)
  async onPetMarkedFound(event: PetMarkedFoundEvent) {
    await this.handle(DOMAIN_EVENTS.PET_MARKED_FOUND, event.ownerId, {
      ...event,
    });

    // Any scan/found-report notification pinned as CRITICAL while this pet
    // was missing is now stale — downgrade it so it clears in a day instead
    // of staying pinned forever.
    try {
      await this.notificationsService.resolveMissingContext(
        event.ownerId,
        event.petId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to resolve missing-context notifications for pet ${event.petId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  @OnEvent(DOMAIN_EVENTS.TAG_ASSIGNED)
  async onTagAssigned(event: TagAssignedEvent) {
    await this.handle(DOMAIN_EVENTS.TAG_ASSIGNED, event.ownerId, {
      ...event,
    });
  }

  @OnEvent(DOMAIN_EVENTS.TAG_UNASSIGNED)
  async onTagUnassigned(event: TagUnassignedEvent) {
    await this.handle(DOMAIN_EVENTS.TAG_UNASSIGNED, event.ownerId, {
      ...event,
    });
  }

  @OnEvent(DOMAIN_EVENTS.QR_TAG_SCANNED)
  async onQrTagScanned(event: QrTagScannedEvent) {
    await this.handle(DOMAIN_EVENTS.QR_TAG_SCANNED, event.ownerId, {
      ...event,
    });
  }

  @OnEvent(DOMAIN_EVENTS.FOUND_REPORT_CREATED)
  async onFoundReportCreated(event: FoundReportCreatedEvent) {
    await this.handle(DOMAIN_EVENTS.FOUND_REPORT_CREATED, event.ownerId, {
      ...event,
    });
  }

  @OnEvent(DOMAIN_EVENTS.VACCINATION_REMINDER_DUE)
  async onVaccinationReminderDue(event: VaccinationReminderDueEvent) {
    await this.handle(DOMAIN_EVENTS.VACCINATION_REMINDER_DUE, event.ownerId, {
      ...event,
    });
  }

  // DatingService.swipe() only ever emits this once per genuinely new match
  // (a race-loser or a re-swipe on an already-matched pair resolves to the
  // same Match without re-emitting — see the comment there), so "one event"
  // already means "one notification per side" here; no separate idempotency
  // check is needed on this end. One notification is created per owner,
  // each phrased from that owner's own pet's perspective, so both sides see
  // this in their Notifications list and — since it's the same unread
  // in-app Notification the rest of the app already uses — the Matchup
  // section can surface the same "new match" indicator by checking for
  // unread notifications of this type (`GET /notifications?type=dating.match-created&unreadOnly=true`)
  // rather than a parallel mechanism.
  @OnEvent(DOMAIN_EVENTS.DATING_MATCH_CREATED)
  async onDatingMatchCreated(event: DatingMatchCreatedEvent) {
    await this.handle(DOMAIN_EVENTS.DATING_MATCH_CREATED, event.ownerAId, {
      ...event,
      petId: event.petAId,
      petName: event.petAName,
      otherPetName: event.petBName,
    });

    await this.handle(DOMAIN_EVENTS.DATING_MATCH_CREATED, event.ownerBId, {
      ...event,
      petId: event.petBId,
      petName: event.petBName,
      otherPetName: event.petAName,
    });
  }
}
