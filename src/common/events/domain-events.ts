// Shared, dependency-free event contracts. Any module may import this file to
// emit or listen without creating a module-to-module dependency edge — the
// emitter builds the full payload itself (ownerId/ownerEmail/petName), so the
// listener in NotificationsModule never needs to reach back into Pets/Users.

export const DOMAIN_EVENTS = {
  PET_MARKED_LOST: 'pet.marked-lost',
  PET_MARKED_FOUND: 'pet.marked-found',
  TAG_ASSIGNED: 'tag.assigned',
  TAG_UNASSIGNED: 'tag.unassigned',
  QR_TAG_SCANNED: 'qr.tag-scanned',
  FOUND_REPORT_CREATED: 'found-report.created',
  VACCINATION_REMINDER_DUE: 'vaccination.reminder-due',
  // Owner self-service pet deletion (PetsService.remove) — lets modules with
  // pet-keyed data (dating profiles/swipes/matches, medical, vaccinations,
  // scans, found reports, ...) clean up after themselves without PetsService
  // depending on any of them directly. Mirrors AdminService.deletePet's
  // explicit cascade, which stays as-is for admin-initiated deletes.
  PET_DELETED: 'pet.deleted',
  // Phase 12 — real-time dating signaling. DatingGateway (the Socket.IO
  // layer) listens on these three rather than DatingService reaching into
  // the gateway directly, same decoupling principle as every notification
  // trigger above: a REST-only client still works exactly as before, and a
  // socket-connected client gets these pushed live to the relevant match
  // room. This also means a message sent over the plain REST endpoint still
  // reaches the other side's open socket connection, not just messages sent
  // over the socket itself.
  DATING_MATCH_CREATED: 'dating.match-created',
  DATING_MESSAGE_SENT: 'dating.message-sent',
  DATING_MATCH_UNMATCHED: 'dating.match-unmatched',
} as const;

export type DomainEventName =
  (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

export interface PetMarkedLostEvent {
  ownerId: string;
  ownerEmail: string;
  // Optional — the owner may not have a phone on file. Only SmsChannel reads
  // this (Phase 17); every other consumer is unaffected by its absence.
  ownerPhone?: string;
  petId: string;
  petName: string;
}

export interface PetMarkedFoundEvent {
  ownerId: string;
  ownerEmail: string;
  ownerPhone?: string;
  petId: string;
  petName: string;
}

export interface TagAssignedEvent {
  ownerId: string;
  tagId: string;
  publicCode: string;
  petId: string;
  petName: string;
}

export interface TagUnassignedEvent {
  ownerId: string;
  tagId: string;
  publicCode: string;
  petId: string;
  petName: string;
}

export interface QrTagScannedEvent {
  ownerId: string;
  tagId: string;
  publicCode: string;
  petId: string;
  petName: string;
  // Pet's isLost flag at scan time — decides notification priority/lifetime
  // (see notifications/utils/notification-priority.util.ts).
  isLost: boolean;
}

export interface FoundReportCreatedEvent {
  ownerId: string;
  ownerEmail: string;
  ownerPhone?: string;
  petId: string;
  petName: string;
  foundReportId: string;
  message: string;
  // Pet's isLost flag at report time — decides notification priority/lifetime
  // (see notifications/utils/notification-priority.util.ts).
  isLost: boolean;
}

export interface VaccinationReminderDueEvent {
  ownerId: string;
  ownerEmail: string;
  petName: string;
  vaccineName: string;
  nextDueDate: Date;
}

export interface PetDeletedEvent {
  petId: string;
  ownerId: string;
}

export interface DatingMatchCreatedEvent {
  matchId: string;
  petAId: string;
  petBId: string;
  // Owners of petA/petB respectively — lets DatingGateway push to both
  // users' personal socket room (`user:<id>`), not just the match room,
  // since neither side has necessarily joined the match room yet at the
  // moment a match is created.
  ownerAId: string;
  ownerBId: string;
  // Names at the moment of matching — lets the notifications listener
  // render "<your pet> matched with <their pet>!" for each side without
  // reaching back into PetsService (same "emitter builds the full payload"
  // principle as every other event here).
  petAName: string;
  petBName: string;
}

export interface DatingMessageSentEvent {
  matchId: string;
  messageId: string;
  senderUserId: string;
  content: string;
  createdAt: Date;
  ownerAId: string;
  ownerBId: string;
  // The Match's two participating pets, straight from the Match document —
  // lets a listener (e.g. DatingChatNotificationListener) resolve exactly
  // which pet sent/received this message without a second DB round-trip,
  // even though a single owner may have several pets across several
  // matches. See DatingService.sendMessage().
  petAId: string;
  petBId: string;
}

export interface DatingMatchUnmatchedEvent {
  matchId: string;
  petAId: string;
  petBId: string;
  unmatchedBy: string;
  ownerAId: string;
  ownerBId: string;
}
