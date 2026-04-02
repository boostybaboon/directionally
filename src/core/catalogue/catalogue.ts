import type { CatalogueEntry, CharacterEntry, EnvironmentEntry, LightEntry, SetPieceEntry } from './types.js';
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
 * Returns all light entries from the catalogue.
 * Pass a custom entries array to override the default catalogue (useful for testing).
 */
export function getLights(entries: CatalogueEntry[] = CATALOGUE_ENTRIES): LightEntry[] {
  return entries.filter((e): e is LightEntry => e.kind === 'light');
}

/**
 * Returns all environment entries from the catalogue.
 * Pass a custom entries array to override the default catalogue (useful for testing).
 */
export function getEnvironments(entries: CatalogueEntry[] = CATALOGUE_ENTRIES): EnvironmentEntry[] {
  return entries.filter((e): e is EnvironmentEntry => e.kind === 'environment');
}

/**
 * Looks up a catalogue entry by id.
 * Returns undefined if no match is found.
 * Pass a custom entries array to override the default catalogue (useful for testing).
 */
export function getById(id: string, entries: CatalogueEntry[] = CATALOGUE_ENTRIES): CatalogueEntry | undefined {
  return entries.find(e => e.id === id);
}
