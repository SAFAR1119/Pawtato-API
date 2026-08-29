// A channel decides for itself whether/how to act on an event — e.g. EmailChannel
// looks for `payload.ownerEmail`; a future SmsChannel would look for a phone
// field instead. The listener that calls this never needs to know the
// difference, which is what lets a new channel be added without touching
// any of the modules that emit domain events.
export interface NotificationChannel {
  send(
    userId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void>;
}
