import { createHash, randomInt, timingSafeEqual } from 'crypto';

// crypto.randomInt is a CSPRNG (unlike Math.random), which is what makes this
// safe to use for an authentication OTP — a predictable code would let an
// attacker skip straight to guessing it.
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// Only the SHA-256 hash of the OTP is ever persisted, matching this codebase's
// existing convention for the email-verification/password-reset tokens
// (see utils/token.util.ts) — a database read alone can't be used to forge a
// valid code.
export function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

// Constant-time comparison of two hex-encoded hashes, so a submitted OTP's
// correctness can't be inferred from response timing.
export function otpHashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}
