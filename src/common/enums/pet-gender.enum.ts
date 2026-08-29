// Required on every pet going forward (see Phase 12) — Breeding-mode dating
// match compatibility depends on knowing a pet's sex, so it can no longer be
// optional free text the way it was pre-Phase-12.
export enum PetGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}
