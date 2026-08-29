export interface StorageUploadInput {
  buffer: Buffer;
  folder: string;
  originalName: string;
  mimetype: string;
  // Explicit filename to store under (used as-is). Omit to get a random,
  // collision-safe name derived from originalName's extension.
  filename?: string;
}

export interface StorageProvider {
  upload(input: StorageUploadInput): Promise<string>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
  // Inverse of getUrl() — deletes whatever object a previously-stored URL
  // points to. No-ops (rather than throwing) when the URL doesn't match this
  // provider's own URL shape, so callers can pass a possibly-empty/foreign
  // field value without checking it first.
  deleteByUrl(url: string): Promise<void>;
  // Stores an object that must never be reachable via getUrl()/a public
  // link — the only sensitive-document path in the app today is NID
  // verification (Phase 11). Local: written outside the ServeStaticModule
  // root entirely. S3: same object storage, but callers must never call
  // getUrl() on the returned key — only getSignedUrl() below.
  uploadPrivate(input: StorageUploadInput): Promise<string>;
  // Short-lived, time-limited read access to a private object — never a
  // permanent link. Every call to this is expected to be paired with an
  // ActivityService audit-log entry by the caller (see
  // DatingService.getNidExchange()/IdentityVerificationService).
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  // Counterpart to uploadPrivate() — deletes an object stored there by key.
  // Kept distinct from delete() since a local implementation stores public
  // and private objects under different roots.
  deletePrivate(key: string): Promise<void>;
}
