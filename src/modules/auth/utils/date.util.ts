// Pawtato's product spec places the (fictional) company in Dhanmondi, Dhaka —
// used consistently as the reference timezone for user-facing timestamps in
// security emails.
export function formatDhakaDateTime(date: Date): string {
  const formatted = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Dhaka',
  }).format(date);

  return `${formatted} (Asia/Dhaka)`;
}
