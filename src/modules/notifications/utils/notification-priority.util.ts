import { DOMAIN_EVENTS } from '../../../common/events/domain-events';
import { NotificationPriority } from '../enums/notification-priority.enum';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Only scan/found-report events carry safety-relevant urgency tied to whether
// the pet is currently missing; every other event type is routine account
// activity regardless of the pet's status.
export function resolvePriority(
  type: string,
  isLost: boolean,
): NotificationPriority {
  switch (type) {
    case DOMAIN_EVENTS.QR_TAG_SCANNED:
      return isLost
        ? NotificationPriority.CRITICAL
        : NotificationPriority.TRANSIENT;

    case DOMAIN_EVENTS.FOUND_REPORT_CREATED:
      return isLost
        ? NotificationPriority.CRITICAL
        : NotificationPriority.STANDARD;

    default:
      return NotificationPriority.STANDARD;
  }
}

export function resolveExpiresAt(
  priority: NotificationPriority,
  from: Date = new Date(),
): Date | null {
  switch (priority) {
    case NotificationPriority.TRANSIENT:
      return new Date(from.getTime() + TEN_MINUTES_MS);

    case NotificationPriority.STANDARD:
    case NotificationPriority.STALE_MISSING:
      return new Date(from.getTime() + ONE_DAY_MS);

    case NotificationPriority.CRITICAL:
      return null;
  }
}
