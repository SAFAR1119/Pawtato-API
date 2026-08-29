// Pulls the bare address out of a "Display Name <email@x.com>" MAIL_FROM
// value for display in email footers ("reply to this address").
export function extractEmailAddress(from: string): string {
  const match = /<([^>]+)>/.exec(from);

  return match ? match[1] : from;
}
