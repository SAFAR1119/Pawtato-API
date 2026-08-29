// Escapes a user-supplied string so it's safe to interpolate into a Mongo
// `$regex` filter as a literal match rather than being interpreted as regex
// syntax (e.g. a species value containing `.` or `*`).
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
