import type { GeometryConfig, MaterialConfig, Vec3 } from '../domain/types.js';
import { documentFromParts } from '../sketcher/documentTree.js';
import type { PartSeed } from '../sketcher/documentTree.js';
import type { SetPieceEntry } from './types.js';

/**
 * Bundled set pieces, authored as tree documents — the same representation a
 * sketcher-authored set has, so production realises both through one path
 * (ROADMAP_CATALOGUE step 8). Props are assembled from catalogue parts
 * (`kind: 'catalogue'`), which is also what makes them editable after insertion:
 * `insertCatalogueEntry` copies these parts into a session's tree.
 */

const IDENTITY_QUATERNION: [number, number, number, number] = [0, 0, 0, 1];

/** -π/2 about X — lies a plane flat on the XZ ground. */
const FLAT_QUATERNION: [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];

const box = (width: number, height: number, depth: number): GeometryConfig => ({ type: 'box', width, height, depth });
const plane = (width: number, height: number): GeometryConfig => ({ type: 'plane', width, height });
const sphere = (radius: number): GeometryConfig => ({ type: 'sphere', radius });
const cylinder = (radiusTop: number, radiusBottom: number, height: number): GeometryConfig =>
  ({ type: 'cylinder', radiusTop, radiusBottom, height });

const mat = (color: number, roughness: number, metalness = 0): MaterialConfig => ({ color, roughness, metalness });

const textured = (
  textureUrl: string,
  repeatU: number,
  repeatV: number,
  roughness: number,
  metalness = 0,
): MaterialConfig => ({ color: 0xffffff, roughness, metalness, textureUrl, repeatU, repeatV });

const NAME_BY_TYPE: Record<GeometryConfig['type'], string> = {
  box: 'Box',
  plane: 'Plane',
  sphere: 'Sphere',
  cylinder: 'Cylinder',
};

/** One catalogue part: procedural geometry + material at a local transform. */
function part(
  label: string,
  geometry: GeometryConfig,
  material: MaterialConfig,
  position?: Vec3,
  quaternion: [number, number, number, number] = IDENTITY_QUATERNION,
): PartSeed {
  return {
    content: {
      id: label,
      kind: 'catalogue',
      name: NAME_BY_TYPE[geometry.type],
      label,
      geometry,
      material,
      color: material.color,
    },
    transform: { position: position ?? [0, 0, 0], quaternion, scale: [1, 1, 1] },
  };
}

/** A single-body set piece: one part, no assembly. Its part keeps the entry's id as its label. */
function solid(
  id: string,
  label: string,
  geometry: GeometryConfig,
  material: MaterialConfig,
  quaternion?: [number, number, number, number],
): SetPieceEntry {
  return {
    kind: 'set-piece',
    id,
    label,
    document: documentFromParts([part(id, geometry, material, undefined, quaternion)]),
  };
}

export const BUNDLED_SET_PIECES: SetPieceEntry[] = [
  // ── Primitives ────────────────────────────────────────────────────────────
  solid('floor-plane', 'Floor (plane)', plane(10, 10), mat(0x444444, 0.8, 0.1), FLAT_QUATERNION),
  solid('box', 'Box', box(1, 1, 1), mat(0x8844aa, 0.5, 0.2)),
  solid('sphere', 'Sphere', sphere(0.5), mat(0x4488cc, 0.5, 0.2)),
  solid('cylinder', 'Cylinder', cylinder(0.5, 0.5, 1), mat(0xaa6644, 0.5, 0.2)),

  // ── Set dressing ──────────────────────────────────────────────────────────
  solid('wall-flat', 'Wall Flat', box(4, 3, 0.15), mat(0xddd8c4, 0.9)),
  solid('stage-deck', 'Stage Deck', plane(8, 8), mat(0x8b6914, 0.85, 0.05), FLAT_QUATERNION),
  solid('studio-backdrop', 'Studio Backdrop', box(6, 4, 0.1), mat(0x1a2a4a, 0.95)),
  solid('table', 'Table', box(1.5, 0.75, 0.5), mat(0x4a3728, 0.7, 0.1)),
  solid('step', 'Step', box(1, 0.2, 0.6), mat(0x555555, 0.8, 0.1)),

  // ── Textured ──────────────────────────────────────────────────────────────
  solid('brick-wall', 'Brick Wall', box(4, 3, 0.15), textured('/textures/brick.jpg', 2.5, 1.5, 0.9)),
  solid('concrete-floor', 'Concrete Floor', plane(10, 10), textured('/textures/concrete.jpg', 4, 4, 0.95), FLAT_QUATERNION),
  solid('wood-floor', 'Wood Floor', plane(8, 8), textured('/textures/wood-boards.jpg', 3, 3, 0.7, 0.05), FLAT_QUATERNION),
  solid('plaster-wall', 'Plaster Wall', box(4, 3, 0.15), textured('/textures/plaster.jpg', 2, 1.5, 0.85)),

  // ── Composite props (assemblies the sketch tool inserts as one unit) ───────
  {
    kind: 'set-piece',
    id: 'chair',
    label: 'Chair',
    document: documentFromParts([
      part('seat', box(0.45, 0.06, 0.45), mat(0x6b4a2f, 0.7), [0, 0.46, 0]),
      part('back', box(0.45, 0.5, 0.06), mat(0x6b4a2f, 0.7), [0, 0.74, -0.2]),
      part('leg', box(0.05, 0.46, 0.05), mat(0x3a2a1a, 0.6), [-0.18, 0.23, -0.18]),
      part('leg', box(0.05, 0.46, 0.05), mat(0x3a2a1a, 0.6), [0.18, 0.23, -0.18]),
      part('leg', box(0.05, 0.46, 0.05), mat(0x3a2a1a, 0.6), [-0.18, 0.23, 0.18]),
      part('leg', box(0.05, 0.46, 0.05), mat(0x3a2a1a, 0.6), [0.18, 0.23, 0.18]),
    ]),
  },
  {
    kind: 'set-piece',
    id: 'desk',
    label: 'Desk',
    document: documentFromParts([
      part('top', box(1.0, 0.05, 0.6), mat(0xb08d57, 0.5, 0.1), [0, 0.72, 0]),
      part('side', box(0.05, 0.72, 0.6), mat(0x8a6a40, 0.5), [-0.45, 0.36, 0]),
      part('side', box(0.05, 0.72, 0.6), mat(0x8a6a40, 0.5), [0.45, 0.36, 0]),
    ]),
  },
  {
    kind: 'set-piece',
    id: 'bench',
    label: 'Bench',
    document: documentFromParts([
      part('seat', box(1.6, 0.08, 0.5), mat(0x6b4a2f, 0.7), [0, 0.45, 0]),
      part('back', box(1.6, 0.45, 0.08), mat(0x3a2a1a, 0.6), [0, 0.22, -0.21]),
    ]),
  },
  {
    kind: 'set-piece',
    id: 'whiteboard',
    label: 'Whiteboard',
    document: documentFromParts([
      part('board', box(2.4, 1.2, 0.05), mat(0xf2f2f2, 0.2, 0.1), [0, 1.8, 0]),
    ]),
  },
  {
    kind: 'set-piece',
    id: 'blackboard',
    label: 'Blackboard',
    document: documentFromParts([
      part('board', box(2.4, 1.2, 0.05), mat(0x1a2f1a, 0.8), [0, 1.8, 0]),
    ]),
  },
  {
    kind: 'set-piece',
    id: 'window-flat',
    label: 'Window',
    document: documentFromParts([
      part('glass', box(1.2, 1.4, 0.06), mat(0x9ec5d0, 0.1, 0.1), [0, 1.8, 0]),
      part('frame', box(1.3, 1.5, 0.04), mat(0xd9d9d9, 0.5, 0.2), [0, 1.8, 0.02]),
    ]),
  },
  {
    kind: 'set-piece',
    id: 'door',
    label: 'Door',
    document: documentFromParts([
      part('panel', box(0.9, 2.0, 0.06), mat(0x5a3a24, 0.6, 0.1), [0, 1.0, 0]),
      part('knob', sphere(0.04), mat(0xcccccc, 0.3, 0.8), [0.35, 1.0, 0.04]),
    ]),
  },
  {
    kind: 'set-piece',
    id: 'bookshelf',
    label: 'Bookshelf',
    document: documentFromParts([
      part('case', box(1.0, 2.0, 0.3), mat(0x6b4a2f, 0.6), [0, 1.0, 0]),
      part('shelf', box(0.9, 0.35, 0.25), mat(0x7a5a3a, 0.6), [0, 0.5, 0.02]),
      part('shelf', box(0.9, 0.35, 0.25), mat(0x7a5a3a, 0.6), [0, 1.0, 0.02]),
      part('shelf', box(0.9, 0.35, 0.25), mat(0x7a5a3a, 0.6), [0, 1.5, 0.02]),
    ]),
  },
  {
    kind: 'set-piece',
    id: 'cabin-seat',
    label: 'Cabin Seat',
    document: documentFromParts([
      part('seat', box(0.55, 0.5, 0.55), mat(0x334466, 0.6), [0, 0.45, 0]),
      part('back', box(0.55, 0.6, 0.08), mat(0x334466, 0.6), [0, 0.95, -0.22]),
    ]),
  },
];
