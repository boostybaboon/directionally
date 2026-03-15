import type { GeometryConfig, MaterialConfig, Vec3 } from '../domain/types.js';

export type CatalogueKind = 'character' | 'set-piece';

export interface CharacterEntry {
  kind: 'character';
  id: string;
  label: string;
  /** URL passed to the GLTF loader, e.g. '/models/gltf/RobotExpressive.glb' */
  gltfPath: string;
  /** Clip name to use for the idle/standing pose in scene authoring. */
  defaultAnimation?: string;
  defaultScale?: number;
  /**
   * Euler XYZ rotation (radians) to apply when no authored rotation exists.
   * Use this to correct models whose forward axis differs from +Z (e.g. Soldier
   * was authored facing -Z, so set [0, π, 0] to flip it to face the camera).
   */
  defaultRotation?: Vec3;
}

export interface SetPieceEntry {
  kind: 'set-piece';
  id: string;
  label: string;
  geometry: GeometryConfig;
  material: MaterialConfig;
}

export type CatalogueEntry = CharacterEntry | SetPieceEntry;
