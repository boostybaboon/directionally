import type { GeometryConfig, MaterialConfig } from '../domain/types.js';

export type CatalogueKind = 'character' | 'set-piece';

export interface CharacterEntry {
  kind: 'character';
  id: string;
  label: string;
  /** URL passed to the GLTF loader, e.g. '/models/gltf/RobotExpressive.glb' */
  gltfPath: string;
  /** Animation clip names available on this GLTF. Omit to discover at load time. */
  animationClips?: string[];
  /** Clip name to use for the idle/standing pose in scene authoring. */
  defaultAnimation?: string;
  defaultScale?: number;
}

export interface SetPieceEntry {
  kind: 'set-piece';
  id: string;
  label: string;
  geometry: GeometryConfig;
  material: MaterialConfig;
}

export type CatalogueEntry = CharacterEntry | SetPieceEntry;
