import type { CatalogueEntry } from './types.js';
import { BUNDLED_SET_PIECES } from './bundledSets.js';

/**
 * Bundled asset catalogue — characters and set pieces shipped with the application.
 * Order within each group is display order in the UI.
 */
export const CATALOGUE_ENTRIES: CatalogueEntry[] = [
  // ── Characters ────────────────────────────────────────────────────────────
  {
    kind: 'character',
    id: 'robot-expressive',
    label: 'Robot',
    gltfPath: '/models/gltf/RobotExpressive.glb',
    defaultAnimation: 'Idle',
    walkAnimation: 'Walking',
    // Native GLB height ~4.77 units; 0.35 ≈ 1.67m (human scale)
    defaultScale: 0.35,
  },
  {
    kind: 'character',
    id: 'generic-human',
    label: 'Generic Human',
    // Exported via scripts/exportGenericHuman.mjs, which drives the real
    // /character → Export to Catalogue flow with zero tuning (default
    // ProceduralHumanoid params) — this is what a fresh session produces.
    gltfPath: '/models/gltf/generic-human.glb',
    defaultAnimation: 'idle',
    walkAnimation: 'walk',
    defaultScale: 1,
  },

  // ── Set pieces ────────────────────────────────────────────────────────────
  // Authored as tree documents (bundledSets.ts), so a bundled set piece and a
  // sketcher-authored one share one representation.
  ...BUNDLED_SET_PIECES,

  // ── Lights ────────────────────────────────────────────────────────────────
  {
    kind: 'light',
    id: 'hemisphere-light',
    label: 'Hemisphere Light',
    config: { type: 'hemisphere', skyColor: 0xfff4cc, groundColor: 0x224422, intensity: 1.0 },
  },
  {
    kind: 'light',
    id: 'directional-light',
    label: 'Directional Light',
    config: { type: 'directional', color: 0xffffff, intensity: 1.0, position: [0, 10, 5] },
  },

  // ── Environments ──────────────────────────────────────────────────────────
  {
    kind: 'environment',
    id: 'studio-neutral',
    label: 'Studio (neutral)',
    hdriPath: '/environments/studio-neutral.hdr',
  },
  {
    kind: 'environment',
    id: 'exterior-sky',
    label: 'Exterior (sky)',
    hdriPath: '/environments/exterior-sky.hdr',
  },
  {
    kind: 'environment',
    id: 'evening-warm',
    label: 'Evening (warm)',
    hdriPath: '/environments/evening-warm.hdr',
  },
];
