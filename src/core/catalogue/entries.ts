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

  // ── Textured set pieces ───────────────────────────────────────────────────
  {
    kind: 'set-piece',
    id: 'brick-wall',
    label: 'Brick Wall',
    geometry: { type: 'box', width: 4, height: 3, depth: 0.15 },
    material: { color: 0xffffff, roughness: 0.9, metalness: 0.0, textureUrl: '/textures/brick.jpg', repeatU: 2.5, repeatV: 1.5 },
  },
  {
    kind: 'set-piece',
    id: 'concrete-floor',
    label: 'Concrete Floor',
    geometry: { type: 'plane', width: 10, height: 10 },
    material: { color: 0xffffff, roughness: 0.95, metalness: 0.0, textureUrl: '/textures/concrete.jpg', repeatU: 4, repeatV: 4 },
    defaultRotation: [-Math.PI / 2, 0, 0],
  },
  {
    kind: 'set-piece',
    id: 'wood-floor',
    label: 'Wood Floor',
    geometry: { type: 'plane', width: 8, height: 8 },
    material: { color: 0xffffff, roughness: 0.7, metalness: 0.05, textureUrl: '/textures/wood-boards.jpg', repeatU: 3, repeatV: 3 },
    defaultRotation: [-Math.PI / 2, 0, 0],
  },
  {
    kind: 'set-piece',
    id: 'plaster-wall',
    label: 'Plaster Wall',
    geometry: { type: 'box', width: 4, height: 3, depth: 0.15 },
    material: { color: 0xffffff, roughness: 0.85, metalness: 0.0, textureUrl: '/textures/plaster.jpg', repeatU: 2, repeatV: 1.5 },
  },

  // ── Composite set pieces (reusable props assembled from primitives) ────────
  {
    kind: 'set-piece',
    id: 'chair',
    label: 'Chair',
    compose: [
      { geometry: { type: 'box', width: 0.45, height: 0.06, depth: 0.45 }, material: { color: 0x6b4a2f, roughness: 0.7, metalness: 0 }, position: [0, 0.46, 0] },
      { geometry: { type: 'box', width: 0.45, height: 0.5, depth: 0.06 }, material: { color: 0x6b4a2f, roughness: 0.7, metalness: 0 }, position: [0, 0.74, -0.2] },
      { geometry: { type: 'box', width: 0.05, height: 0.46, depth: 0.05 }, material: { color: 0x3a2a1a, roughness: 0.6, metalness: 0 }, position: [-0.18, 0.23, -0.18] },
      { geometry: { type: 'box', width: 0.05, height: 0.46, depth: 0.05 }, material: { color: 0x3a2a1a, roughness: 0.6, metalness: 0 }, position: [0.18, 0.23, -0.18] },
      { geometry: { type: 'box', width: 0.05, height: 0.46, depth: 0.05 }, material: { color: 0x3a2a1a, roughness: 0.6, metalness: 0 }, position: [-0.18, 0.23, 0.18] },
      { geometry: { type: 'box', width: 0.05, height: 0.46, depth: 0.05 }, material: { color: 0x3a2a1a, roughness: 0.6, metalness: 0 }, position: [0.18, 0.23, 0.18] },
    ],
  },
  {
    kind: 'set-piece',
    id: 'desk',
    label: 'Desk',
    compose: [
      { geometry: { type: 'box', width: 1.0, height: 0.05, depth: 0.6 }, material: { color: 0xb08d57, roughness: 0.5, metalness: 0.1 }, position: [0, 0.72, 0] },
      { geometry: { type: 'box', width: 0.05, height: 0.72, depth: 0.6 }, material: { color: 0x8a6a40, roughness: 0.5, metalness: 0 }, position: [-0.45, 0.36, 0] },
      { geometry: { type: 'box', width: 0.05, height: 0.72, depth: 0.6 }, material: { color: 0x8a6a40, roughness: 0.5, metalness: 0 }, position: [0.45, 0.36, 0] },
    ],
  },
  {
    kind: 'set-piece',
    id: 'bench',
    label: 'Bench',
    compose: [
      { geometry: { type: 'box', width: 1.6, height: 0.08, depth: 0.5 }, material: { color: 0x6b4a2f, roughness: 0.7, metalness: 0 }, position: [0, 0.45, 0] },
      { geometry: { type: 'box', width: 1.6, height: 0.45, depth: 0.08 }, material: { color: 0x3a2a1a, roughness: 0.6, metalness: 0 }, position: [0, 0.22, -0.21] },
    ],
  },
  {
    kind: 'set-piece',
    id: 'whiteboard',
    label: 'Whiteboard',
    compose: [
      { geometry: { type: 'box', width: 2.4, height: 1.2, depth: 0.05 }, material: { color: 0xf2f2f2, roughness: 0.2, metalness: 0.1 }, position: [0, 1.8, 0] },
    ],
  },
  {
    kind: 'set-piece',
    id: 'blackboard',
    label: 'Blackboard',
    compose: [
      { geometry: { type: 'box', width: 2.4, height: 1.2, depth: 0.05 }, material: { color: 0x1a2f1a, roughness: 0.8, metalness: 0 }, position: [0, 1.8, 0] },
    ],
  },
  {
    kind: 'set-piece',
    id: 'window-flat',
    label: 'Window',
    compose: [
      { geometry: { type: 'box', width: 1.2, height: 1.4, depth: 0.06 }, material: { color: 0x9ec5d0, roughness: 0.1, metalness: 0.1 }, position: [0, 1.8, 0] },
      { geometry: { type: 'box', width: 1.3, height: 1.5, depth: 0.04 }, material: { color: 0xd9d9d9, roughness: 0.5, metalness: 0.2 }, position: [0, 1.8, 0.02] },
    ],
  },
  {
    kind: 'set-piece',
    id: 'door',
    label: 'Door',
    compose: [
      { geometry: { type: 'box', width: 0.9, height: 2.0, depth: 0.06 }, material: { color: 0x5a3a24, roughness: 0.6, metalness: 0.1 }, position: [0, 1.0, 0] },
      { geometry: { type: 'sphere', radius: 0.04 }, material: { color: 0xcccccc, roughness: 0.3, metalness: 0.8 }, position: [0.35, 1.0, 0.04] },
    ],
  },
  {
    kind: 'set-piece',
    id: 'bookshelf',
    label: 'Bookshelf',
    compose: [
      { geometry: { type: 'box', width: 1.0, height: 2.0, depth: 0.3 }, material: { color: 0x6b4a2f, roughness: 0.6, metalness: 0 }, position: [0, 1.0, 0] },
      { geometry: { type: 'box', width: 0.9, height: 0.35, depth: 0.25 }, material: { color: 0x7a5a3a, roughness: 0.6, metalness: 0 }, position: [0, 0.5, 0.02] },
      { geometry: { type: 'box', width: 0.9, height: 0.35, depth: 0.25 }, material: { color: 0x7a5a3a, roughness: 0.6, metalness: 0 }, position: [0, 1.0, 0.02] },
      { geometry: { type: 'box', width: 0.9, height: 0.35, depth: 0.25 }, material: { color: 0x7a5a3a, roughness: 0.6, metalness: 0 }, position: [0, 1.5, 0.02] },
    ],
  },
  {
    kind: 'set-piece',
    id: 'cabin-seat',
    label: 'Cabin Seat',
    compose: [
      { geometry: { type: 'box', width: 0.55, height: 0.5, depth: 0.55 }, material: { color: 0x334466, roughness: 0.6, metalness: 0 }, position: [0, 0.45, 0] },
      { geometry: { type: 'box', width: 0.55, height: 0.6, depth: 0.08 }, material: { color: 0x334466, roughness: 0.6, metalness: 0 }, position: [0, 0.95, -0.22] },
    ],
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
