/**
 * Level-0 clothing (HP-9): a flat-colour, region-based outfit layer over the
 * loft body. Regions are bone-group leaves; a garment covers a set of regions;
 * an outfit is an ordered list applied bottom→top so the topmost garment
 * covering a region wins (cascading, like CSS layers). Textures/UVs can replace
 * the flat colour later without changing this schema.
 */

export type ClothingRegion =
  | 'torso' | 'arm' | 'forearm' | 'hand'
  | 'hips' | 'thigh' | 'shin' | 'foot' | 'toe'
  | 'neck' | 'head';

/** A garment covers a set of regions with one flat colour. */
export interface Garment {
  id: string;
  covers: ClothingRegion[];
  color: number;
}

/** Bottom → top layer order. The topmost garment covering a region wins. */
export interface Outfit {
  garments: Garment[];
}

/** Bone group → clothing region. `shoulder` maps to `torso` because the clavicle
 *  is absorbed into the Spine2 girdle; fingers/toes join hand/foot. */
export const GROUP_REGION: Record<string, ClothingRegion> = {
  hips: 'hips',
  spine: 'torso',
  spine1: 'torso',
  spine2: 'torso',
  shoulder: 'torso',
  arm: 'arm',
  forearm: 'forearm',
  hand: 'hand',
  finger: 'hand',
  upleg: 'thigh',
  leg: 'shin',
  foot: 'foot',
  toe: 'toe',
  neck: 'neck',
  head: 'head',
};

/** Resolve the colour for one region: topmost covering garment, else skin. */
export function resolveOutfitColor(outfit: Outfit, region: ClothingRegion, skinColor: number): number {
  for (let i = outfit.garments.length - 1; i >= 0; i--) {
    if (outfit.garments[i].covers.includes(region)) return outfit.garments[i].color;
  }
  return skinColor;
}

// ── Presets ──────────────────────────────────────────────────────────────────

export const OUTFIT_PRESETS: Record<string, Outfit> = {
  casual: {
    garments: [
      { id: 'pants', covers: ['hips', 'thigh', 'shin'], color: 0x334466 },
      { id: 'shoes', covers: ['foot', 'toe'], color: 0x222222 },
      { id: 'top', covers: ['torso', 'arm', 'forearm'], color: 0x4466aa },
    ],
  },
  teeShorts: {
    garments: [
      { id: 'shorts', covers: ['hips', 'thigh'], color: 0x334466 },
      { id: 'shoes', covers: ['foot', 'toe'], color: 0x222222 },
      { id: 'tee', covers: ['torso', 'arm'], color: 0x4466aa },
    ],
  },
  layered: {
    garments: [
      { id: 'pants', covers: ['hips', 'thigh', 'shin'], color: 0x334466 },
      { id: 'shoes', covers: ['foot', 'toe'], color: 0x222222 },
      { id: 'shirt', covers: ['torso', 'arm', 'forearm'], color: 0x88aadd },
      { id: 'vest', covers: ['torso'], color: 0x1a2a4a },
    ],
  },
  bare: { garments: [] },
};

export const DEFAULT_OUTFIT: Outfit = OUTFIT_PRESETS.casual;

/**
 * Broad human skin-tone swatches (light → deep). Labelled by tone rather than
 * ethnicity so the palette stays descriptive, not reductive, and the full range
 * is present so no group is caricatured.
 */
export const SKIN_TONES: ReadonlyArray<{ readonly label: string; readonly color: number }> = [
  { label: 'Fair',   color: 0xf9d5c1 },
  { label: 'Light',  color: 0xf5cba7 },
  { label: 'Medium', color: 0xe0ac69 },
  { label: 'Tan',    color: 0xc68642 },
  { label: 'Brown',  color: 0x8d5524 },
  { label: 'Deep',   color: 0x4e342e },
];

/** Broad typical hair colours (tone-labelled, mirroring `SKIN_TONES`). */
export const HAIR_COLORS: ReadonlyArray<{ readonly label: string; readonly color: number }> = [
  { label: 'Black', color: 0x1a1a1a },
  { label: 'Brown', color: 0x3d2008 },
  { label: 'Blond', color: 0xd9a066 },
  { label: 'Red',   color: 0x8b3a1a },
  { label: 'Grey',  color: 0x9a9a9a },
];

/** Broad typical eye (iris) colours. */
export const EYE_COLORS: ReadonlyArray<{ readonly label: string; readonly color: number }> = [
  { label: 'Brown', color: 0x4a2c17 },
  { label: 'Blue',  color: 0x2a6fdb },
  { label: 'Green', color: 0x3a6e3a },
  { label: 'Hazel', color: 0x8a6d3b },
];