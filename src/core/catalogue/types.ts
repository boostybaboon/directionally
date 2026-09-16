import type { LightConfig, Vec3 } from '../domain/types.js';
import type { CharacterSpec } from '../character/characterSpec.js';
import type { SetDocument } from '../sketcher/documentTree.js';

export type CatalogueKind = 'character' | 'set-piece' | 'light' | 'environment';

export interface CharacterEntry {
  kind: 'character';
  id: string;
  label: string;
  /**
   * URL passed to the GLTF loader, e.g. '/models/gltf/RobotExpressive.glb'.
   * Absent for spec-backed characters, which carry `spec` and are rebuilt
   * procedurally at scene load (ROADMAP_API.md API-2).
   */
  gltfPath?: string;
  /**
   * High-level character description (`CharacterSpec`). When present, the
   * character is built from this spec at scene load rather than from a GLB.
   */
  spec?: CharacterSpec;
  /** Clip name to use for the idle/standing pose in scene authoring. */
  defaultAnimation?: string;
  /**
   * Clip name to use for locomotion (enter/exit/move) beats. Characters don't
   * agree on a single convention — the Robot's walk clip is "Walking" while
   * procedural humanoid exports use "walk" — so each entry declares its own.
   */
  walkAnimation?: string;
  defaultScale?: number;
  /**
   * Euler XYZ rotation (radians) to apply when no authored rotation exists.
   * Use this to correct models whose forward axis differs from +Z (e.g. a model
   * facing -Z needs [0, π, 0] to face toward the camera).
   */
  defaultRotation?: Vec3;
}

export interface SetPieceEntry {
  kind: 'set-piece';
  id: string;
  label: string;
  /**
   * The entry's tree document — the one representation of a set piece
   * (ROADMAP_CATALOGUE step 8). Bundled definitions carry it inline; a
   * sketcher-authored set stores it in a sibling OPFS file (`hasDocument`),
   * so this is only attached by whoever materialises the entry.
   */
  document?: SetDocument;
  /**
   * True when the entry's document lives in its own OPFS file, loaded by
   * `OPFSCatalogueStore.getDocument` rather than carried inline.
   */
  hasDocument?: boolean;
  /** Optional environment (catalogue id) applied when this entry is used as a setting. */
  environmentId?: string;
  /** Optional lights applied when this entry is used as a setting. */
  lights?: LightConfig[];
  /**
   * Marks this set-piece as a top-level setting (a venue, e.g. "classroom")
   * rather than a component (a prop, e.g. "chair"). When absent, `isSettingEntry`
   * infers top-level status from `environmentId`/`lights` (captured on "save as setting").
   */
  isSetting?: boolean;
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

export interface EnvironmentEntry {
  kind: 'environment';
  id: string;
  label: string;
  /** Path to the .hdr file served from /static, e.g. '/environments/studio-neutral.hdr'. */
  hdriPath: string;
  /** Optional path to a thumbnail image for catalogue preview. */
  thumbnail?: string;
}

export type CatalogueEntry = CharacterEntry | SetPieceEntry | LightEntry | EnvironmentEntry;
