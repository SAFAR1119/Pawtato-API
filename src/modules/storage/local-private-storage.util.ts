import * as path from 'path';

// Deliberately outside `uploads/` — main.ts only serves `uploads/` via
// ServeStaticModule, so anything written here is unreachable except through
// StorageController's signed-token route. Shared (not a class instance
// method) so both LocalDiskStorageProvider and StorageController resolve
// paths identically without StorageController depending on the provider's
// concrete class.
export const PRIVATE_UPLOADS_ROOT = path.join(process.cwd(), 'private-uploads');

// Resolves a storage key to a real file path, returning null if the
// resolved path would escape PRIVATE_UPLOADS_ROOT. Keys are always our own
// randomUUID-based names (never user input), so this is defense in depth
// rather than the primary guarantee.
export function resolvePrivateUploadPath(key: string): string | null {
  const resolved = path.resolve(PRIVATE_UPLOADS_ROOT, key);
  const rootWithSep = path.resolve(PRIVATE_UPLOADS_ROOT) + path.sep;

  return resolved.startsWith(rootWithSep) ? resolved : null;
}
