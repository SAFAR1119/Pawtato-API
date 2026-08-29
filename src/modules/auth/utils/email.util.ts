// Applied before every lookup/creation involving an email address, so
// "User@Example.com" and " user@example.com " resolve to the same account.
// The schema also normalizes on save (lowercase/trim), but callers need the
// normalized value up front to query by it.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
