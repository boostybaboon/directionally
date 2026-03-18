import type { ScriptLine } from '../../lib/sandbox/types.js';
import type {
  ActorVoice,
  CameraConfig,
  LightConfig,
  SetPiece,
  StagedActor,
  SceneAction,
  Block,
} from '../domain/types.js';

/**
 * A cast member in a production: maps a role name to a catalogue character.
 */
export type StoredActor = {
  /** Stable uuid — survives role renames so ScriptLine.actorId refs stay valid. */
  id: string;
  /** Display name for the role, e.g. "Alice" or "Guard". */
  role: string;
  /** id of a CharacterEntry in the catalogue. */
  catalogueId: string;
  /** User-nominated idle/default animation clip. Overrides the catalogue default. */
  idleAnimation?: string;
  /** Uniform scale override. Overrides the catalogue defaultScale. */
  scale?: number;
  /** Per-actor voice configuration. Falls back to cycling DEFAULT_VOICES when absent. */
  voice?: ActorVoice;
};

/**
 * Serialisable representation of a single scene's full composition.
 * When present on a `StoredProduction`, the general `storedSceneToModel`
 * deserialiser is used instead of the legacy `scriptToModel` path.
 */
export type StoredScene = {
  camera: CameraConfig;
  lights: LightConfig[];
  set: SetPiece[];
  stagedActors: StagedActor[];
  actions: SceneAction[];
  /** High-level authored blocks. Compiled to Tracks at load time; never stored as raw Tracks. */
  blocks?: Block[];
  duration?: number;
  backgroundColor?: number;
};

/**
 * A named, individually addressable scene within a production.
 */
export type NamedScene = {
  id: string;
  name: string;
  scene: StoredScene;
};

/**
 * A named production document stored persistently.
 */
export type StoredProduction = {
  /** Globally unique identifier (crypto.randomUUID). */
  id: string;
  name: string;
  createdAt: number;  // unix ms
  modifiedAt: number; // unix ms
  /** Cast members. Absent on pre-5a productions — falls back to legacy alpha/beta pair. */
  actors?: StoredActor[];
  /**
   * Ordered list of named scenes. The active scene is identified by activeSceneId,
   * defaulting to scenes[0] when absent.
   */
  scenes?: NamedScene[];
  /** ID of the currently active scene within `scenes`. Defaults to scenes[0]. */
  activeSceneId?: string;
  /**
   * Legacy singular scene field. Kept for backward compat.
   * When `scenes` is present, commands operate on the active entry within `scenes`
   * and this field is not used.
   */
  scene?: StoredScene;
  /** Dialogue lines. Populated on legacy productions; cleared after migration to the scene path. */
  script?: ScriptLine[];
};
