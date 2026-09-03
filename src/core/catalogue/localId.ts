import type { PlacedProp } from '../domain/types.js';

/**
 * Generate a stable per-child identifier for a catalogue Definition's `compose`
 * list (Track SET, N1). Unlike an array index, a `localId` survives reordering
 * or insertion of sibling entries — the prerequisite for any future override
 * mechanism (Track SET, N5+) to keep addressing the same child across edits.
 */
export function generateLocalId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Return a copy of `compose` where every entry has a `localId`, generating one
 * for any entry that lacks it. Entries that already carry a `localId` are left
 * untouched — calling this repeatedly on an already-assigned list is a no-op
 * (idempotent), so it is safe to call on load as a migration step.
 */
export function assignLocalIds(compose: PlacedProp[]): PlacedProp[] {
  return compose.map((p) => (p.localId ? p : { ...p, localId: generateLocalId() }));
}
