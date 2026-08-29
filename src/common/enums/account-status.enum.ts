// The single source of truth for an account's email-verification lifecycle —
// deliberately one enum rather than parallel booleans (isRegistered/isVerified/etc.)
// so "pending" vs "active" can never disagree with each other.
export enum AccountStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  ACTIVE = 'ACTIVE',
}
