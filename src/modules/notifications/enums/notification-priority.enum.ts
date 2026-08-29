// Drives how long a notification survives before the cleanup cron deletes it
// (see jobs/notification-cleanup.job.ts). Independent of read/unread — reading
// a notification never affects its lifetime, only priority/expiresAt does.
export enum NotificationPriority {
  // Routine scan while the pet is NOT missing — noise, gone in 10 minutes.
  TRANSIENT = 'transient',
  // Everyday admin/CRUD activity (tag created/assigned/unassigned, vaccination
  // reminders, etc.) — kept for a day, then cleared.
  STANDARD = 'standard',
  // Scan or found-report notification created while the pet WAS missing, kept
  // pinned as CRITICAL until the pet is found; once found it is downgraded to
  // this and cleared a day later (see NotificationsService.resolveMissingContext).
  STALE_MISSING = 'stale_missing',
  // Scan or found-report notification created while the pet IS missing — the
  // important ones. Never auto-deleted; only a user action or the pet being
  // found (which downgrades it to STALE_MISSING) removes it.
  CRITICAL = 'critical',
}
