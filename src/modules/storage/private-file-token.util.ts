import { JwtService } from '@nestjs/jwt';

// A short-lived, signed, opaque token embedding a private storage key —
// backs LocalDiskStorageProvider.getSignedUrl()/StorageController. Reuses
// JWT_SECRET purely as an HMAC signing key for this narrow purpose (not as
// an auth token: it carries no user identity, and its only job is proving
// "this key was legitimately issued a moment ago by our own code," the same
// guarantee a real S3 presigned URL gives for free).
export function signPrivateFileToken(
  secret: string,
  key: string,
  expiresInSeconds: number,
): string {
  const jwtService = new JwtService({ secret });

  return jwtService.sign({ key }, { expiresIn: expiresInSeconds });
}

// Throws (via JwtService.verify) if the token is expired, tampered with, or
// was never signed with this secret — callers should catch and translate to
// a generic 404 rather than distinguishing "expired" from "invalid".
export function verifyPrivateFileToken(secret: string, token: string): string {
  const jwtService = new JwtService({ secret });
  const payload = jwtService.verify<{ key: string }>(token);

  return payload.key;
}
