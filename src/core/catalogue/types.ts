import type { GeometryConfig, LightConfig, MaterialConfig, Vec3 } from '../domain/types.js';

export type CatalogueKind = 'character' | 'set-piece' | 'light';

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

/** Distributive Omit: correctly removes a key from each member of a union type. */
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

export interface LightEntry {
  kind: 'light';
  /** Catalogue template id, e.g. 'hemisphere-light'. */
  id: string;
  label: string;
  /** Default configuration — the `id` field is assigned at add-time. */
  config: DistributiveOmit<LightConfig, 'id'>;
}

export type CatalogueEntry = CharacterEntry | SetPieceEntry | LightEntry;
