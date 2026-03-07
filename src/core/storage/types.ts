import type { ScriptLine } from '../../lib/sandbox/types.js';
import type {
  CameraConfig,
  LightConfig,
  SetPiece,
  StagedActor,
  SceneAction,
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
  duration?: number;
  backgroundColor?: number;
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
  /** Authored scene composition. When present, `storedSceneToModel` renders the production. */
  scene?: StoredScene;
  /** Dialogue lines. Populated on legacy productions; cleared after migration to the scene path. */
  script?: ScriptLine[];
};
