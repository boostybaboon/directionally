import type { ScriptLine } from '../../lib/script/types.js';
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
  /** Emissive tint as a 24-bit RGB integer (e.g. 0x4a9eff). Auto-assigned from the ACTOR_COLORS palette at AddActorCommand time. */
  tint?: number;
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
  /**
   * Ordered full script sequence for this scene: dialogue and direction lines interleaved.
   * When absent, the production view falls back to deriving dialogue from scene.actions.
   */
  script?: ScriptLine[];
  /**
   * Optional scene-ending instruction rendered after the scene's last line in the full
   * script view (e.g. "LIGHTS FADE TO BLACK."). Not part of the scene's scripted content.
   */
  transition?: string;
};

/**
 * A named group that contains scenes (and optionally nested groups).
 * Acts as an "Act" container in the production hierarchy.
 */
export type StoredGroup = {
  type: 'group';
  id: string;
  name: string;
  children: Array<StoredGroup | NamedScene>;
  /**
   * Optional context note rendered below the act heading in the full script view
   * (e.g. "Three days later. The same warehouse, now ransacked.").
   */
  notes?: string;
};

/** Depth-first flat list of all leaf scenes in a tree. */
export function getScenes(tree: Array<StoredGroup | NamedScene>): NamedScene[] {
  const result: NamedScene[] = [];
  for (const node of tree) {
    if ((node as StoredGroup).type === 'group') {
      result.push(...getScenes((node as StoredGroup).children));
    } else {
      result.push(node as NamedScene);
    }
  }
  return result;
}

/**
 * Per-production TTS engine and bubble scale override.
 * Absent = use the global defaults stored in localStorage.
 */
export type ProductionSpeechSettings = {
  engine: 'espeak' | 'web-speech' | 'kokoro';
  bubbleScale: number;
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
  /** Cast members. */
  actors?: StoredActor[];
  /**
   * Ordered tree of acts (groups) and scenes. Depth-first traversal gives the playback order.
   * Use `getScenes(tree)` for a flat list of leaf scenes.
   */
  tree?: Array<StoredGroup | NamedScene>;
  /** ID of the currently active scene. Defaults to the first scene in DFS order. */
  activeSceneId?: string;
  /** Per-production TTS engine and bubble scale override. Absent = use global defaults. */
  speechSettings?: ProductionSpeechSettings;
  /** Dialogue lines. Populated on legacy productions; cleared after migration to the scene path. */
  script?: ScriptLine[];
};
