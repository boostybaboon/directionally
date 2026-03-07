import type { CatalogueEntry, CharacterEntry, SetPieceEntry } from './types.js';
import { CATALOGUE_ENTRIES } from './entries.js';

/**
 * Returns all character entries from the catalogue.
 * Pass a custom entries array to override the default catalogue (useful for testing).
 */
export function getCharacters(entries: CatalogueEntry[] = CATALOGUE_ENTRIES): CharacterEntry[] {
  return entries.filter((e): e is CharacterEntry => e.kind === 'character');
}

/**
 * Returns all set-piece entries from the catalogue.
 * Pass a custom entries array to override the default catalogue (useful for testing).
 */
export function getSetPieces(entries: CatalogueEntry[] = CATALOGUE_ENTRIES): SetPieceEntry[] {
  return entries.filter((e): e is SetPieceEntry => e.kind === 'set-piece');
}

/**
 * Looks up a catalogue entry by id.
 * Returns undefined if no match is found.
 * Pass a custom entries array to override the default catalogue (useful for testing).
 */
export function getById(id: string, entries: CatalogueEntry[] = CATALOGUE_ENTRIES): CatalogueEntry | undefined {
  return entries.find(e => e.id === id);
}
