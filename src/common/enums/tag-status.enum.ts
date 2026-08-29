export enum TagStatus {
  // Admin-manufactured inventory, not yet claimed by any user — has no
  // ownerId. Distinct from AVAILABLE, which always has an owner (either
  // self-service-created, or MANUFACTURED then claimed).
  MANUFACTURED = 'MANUFACTURED',
  // Owned (self-service or claimed from a manufactured batch), not yet linked to a pet.
  AVAILABLE = 'AVAILABLE',
  ASSIGNED = 'ASSIGNED',
  // Moderation-only states (admin), independent of the owner's own actions.
  SUSPENDED = 'SUSPENDED',
  RETIRED = 'RETIRED',
}
