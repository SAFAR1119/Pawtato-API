import { DOMAIN_EVENTS } from '../../../common/events/domain-events';

export interface RenderedNotification {
  title: string;
  message: string;
  // Whether this event type is worth an email, not just an in-app record —
  // e.g. a tag being (un)assigned or a routine scan isn't, a found report is.
  sendEmail: boolean;
  // Same idea, for the push/SMS channels added in Phase 17. Push is cheap
  // (no per-message cost) so it defaults on for anything time-relevant; SMS
  // costs money per message so it defaults off except the one case where a
  // few minutes matter more than anything else — a possible sighting of a
  // lost pet.
  sendPush: boolean;
  sendSms: boolean;
}

function formatDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toDateString();
  }

  return String(value);
}

export function renderNotification(
  type: string,
  payload: Record<string, unknown>,
): RenderedNotification {
  const petName =
    typeof payload.petName === 'string' ? payload.petName : 'Your pet';

  switch (type) {
    case DOMAIN_EVENTS.PET_MARKED_LOST:
      return {
        title: 'Pet marked as lost',
        message: `${petName} was marked as lost. We'll notify you the moment someone reports finding them.`,
        sendEmail: true,
        sendPush: true,
        sendSms: false,
      };

    case DOMAIN_EVENTS.PET_MARKED_FOUND:
      return {
        title: 'Pet marked as found',
        message: `${petName} was marked as found. Glad they're back safe!`,
        sendEmail: true,
        sendPush: true,
        sendSms: false,
      };

    case DOMAIN_EVENTS.TAG_ASSIGNED:
      return {
        title: 'QR tag assigned',
        message: `A QR tag was assigned to ${petName}.`,
        sendEmail: false,
        sendPush: false,
        sendSms: false,
      };

    case DOMAIN_EVENTS.TAG_UNASSIGNED:
      return {
        title: 'QR tag unassigned',
        message: `The QR tag was removed from ${petName}.`,
        sendEmail: false,
        sendPush: false,
        sendSms: false,
      };

    case DOMAIN_EVENTS.QR_TAG_SCANNED:
      return {
        title: "Pet's tag was scanned",
        message: `${petName}'s QR tag was just scanned by someone.`,
        sendEmail: false,
        sendPush: false,
        sendSms: false,
      };

    case DOMAIN_EVENTS.FOUND_REPORT_CREATED:
      return {
        title: 'Someone may have found your pet!',
        message:
          typeof payload.message === 'string'
            ? payload.message
            : `Someone submitted a found report for ${petName}.`,
        sendEmail: true,
        sendPush: true,
        sendSms: true,
      };

    case DOMAIN_EVENTS.VACCINATION_REMINDER_DUE:
      return {
        title: 'Vaccination reminder',
        message: `${petName}'s vaccination "${String(payload.vaccineName)}" is due on ${formatDate(payload.nextDueDate)}.`,
        sendEmail: true,
        sendPush: false,
        sendSms: false,
      };

    case DOMAIN_EVENTS.DATING_MATCH_CREATED: {
      const otherPetName =
        typeof payload.otherPetName === 'string'
          ? payload.otherPetName
          : 'another pet';

      return {
        title: "It's a match!",
        message: `${petName} matched with ${otherPetName}. Say hello!`,
        sendEmail: false,
        sendPush: true,
        sendSms: false,
      };
    }

    default:
      return {
        title: 'Notification',
        message: 'You have a new notification.',
        sendEmail: false,
        sendPush: false,
        sendSms: false,
      };
  }
}
