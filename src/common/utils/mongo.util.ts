// MongoDB's raw duplicate-key error (E11000) — thrown when a unique index
// (e.g. User.email) rejects an insert. Used to turn a database-level race
// condition (two concurrent registrations for the same email) into the same
// friendly application response as the pre-insert check, instead of a 500.
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}
