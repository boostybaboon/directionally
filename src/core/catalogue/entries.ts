import type { CatalogueEntry } from './types.js';

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
    defaultScale: 1,
  },
  {
    kind: 'character',
    id: 'soldier',
    label: 'Soldier',
    gltfPath: '/models/gltf/Soldier.glb',
    // Clips present in the Three.js Soldier example asset (MIT licensed).
    defaultAnimation: 'idle',
    defaultScale: 2.7,
    // Soldier was authored facing -Z; flip 180° around Y so it faces +Z (toward camera).
    defaultRotation: [0, Math.PI, 0],
  },

  // ── Set pieces ────────────────────────────────────────────────────────────
  {
    kind: 'set-piece',
    id: 'floor-plane',
    label: 'Floor (plane)',
    geometry: { type: 'plane', width: 10, height: 10 },
    material: { color: 0x444444, roughness: 0.8, metalness: 0.1 },
    // THREE.PlaneGeometry is in the XY plane; rotate to lie flat on XZ ground.
    defaultRotation: [-Math.PI / 2, 0, 0],
  },
  {
    kind: 'set-piece',
    id: 'box',
    label: 'Box',
    geometry: { type: 'box', width: 1, height: 1, depth: 1 },
    material: { color: 0x8844aa, roughness: 0.5, metalness: 0.2 },
  },
  {
    kind: 'set-piece',
    id: 'sphere',
    label: 'Sphere',
    geometry: { type: 'sphere', radius: 0.5 },
    material: { color: 0x4488cc, roughness: 0.5, metalness: 0.2 },
  },
  {
    kind: 'set-piece',
    id: 'cylinder',
    label: 'Cylinder',
    geometry: { type: 'cylinder', radiusTop: 0.5, radiusBottom: 0.5, height: 1 },
    material: { color: 0xaa6644, roughness: 0.5, metalness: 0.2 },
  },
  {
    kind: 'set-piece',
    id: 'wall-flat',
    label: 'Wall Flat',
    geometry: { type: 'box', width: 4, height: 3, depth: 0.15 },
    material: { color: 0xddd8c4, roughness: 0.9, metalness: 0.0 },
  },
  {
    kind: 'set-piece',
    id: 'stage-deck',
    label: 'Stage Deck',
    geometry: { type: 'plane', width: 8, height: 8 },
    material: { color: 0x8b6914, roughness: 0.85, metalness: 0.05 },
    // THREE.PlaneGeometry is in the XY plane; rotate to lie flat on XZ ground.
    defaultRotation: [-Math.PI / 2, 0, 0],
  },
  {
    kind: 'set-piece',
    id: 'studio-backdrop',
    label: 'Studio Backdrop',
    geometry: { type: 'box', width: 6, height: 4, depth: 0.1 },
    material: { color: 0x1a2a4a, roughness: 0.95, metalness: 0.0 },
  },
  {
    kind: 'set-piece',
    id: 'table',
    label: 'Table',
    geometry: { type: 'box', width: 1.5, height: 0.75, depth: 0.5 },
    material: { color: 0x4a3728, roughness: 0.7, metalness: 0.1 },
  },
  {
    kind: 'set-piece',
    id: 'step',
    label: 'Step',
    geometry: { type: 'box', width: 1, height: 0.2, depth: 0.6 },
    material: { color: 0x555555, roughness: 0.8, metalness: 0.1 },
  },

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
];
