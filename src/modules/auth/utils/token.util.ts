import { createHash, randomBytes } from 'crypto';

// A high-entropy magic-link token (256 bits) — not a typed OTP. Only its
// SHA-256 hash is ever persisted, so a database read alone can't be used to
// forge a valid verification/reset link.
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
