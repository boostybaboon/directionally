// Pure domain config types — no Three.js or Tone.js imports

export type Vec3 = [number, number, number];

export type GeometryConfig =
  | { type: 'box';    width: number; height: number; depth: number }
  | { type: 'plane';  width: number; height: number }
  | { type: 'sphere'; radius: number; widthSegments?: number; heightSegments?: number };

export type MaterialConfig = {
  color: number;
  emissive?: number;
  metalness?: number;
  roughness?: number;
};

// A piece of scenery: static geometry placed in the scene (floor, walls, steps, blocks etc.)
export type SetPiece = {
  name: string;
  geometry: GeometryConfig;
  material: MaterialConfig;
  position?: Vec3;
  rotation?: Vec3;   // Euler XYZ in radians
  scale?: Vec3;
  parent?: string;   // name of another SetPiece or actor to attach to (for hierarchical assemblies)
};

export type ActorAsset =
  | { type: 'gltf'; url: string }
  | { type: 'mesh'; geometry: GeometryConfig; material: MaterialConfig };

export type StagedActor = {
  actorId: string;
  startPosition?: Vec3;  // omit = offstage (not visible at scene start)
  startRotation?: Vec3;
  offstage?: boolean;    // explicit offstage; actor is loaded but not placed
};

export type CameraConfig = {
  fov?: number;
  near?: number;
  far?: number;
  position: Vec3;
  lookAt: Vec3;
};

export type LightConfig =
  | { type: 'directional'; id: string; color: number; intensity: number; position: Vec3 }
  | { type: 'hemisphere';  id: string; skyColor: number; groundColor: number; intensity: number; position?: Vec3 }
  | { type: 'spot';        id: string; color: number; intensity: number; angle?: number; penumbra?: number; decay?: number; position: Vec3; target?: Vec3 }
  | { type: 'point';       id: string; color: number; intensity: number; distance?: number; decay?: number; position: Vec3 };

// --- Voice configuration ---

// All voice IDs shipped with Kokoro-82M.
// Prefix encodes locale and gender: a=American, b=British; f=Female, m=Male.
export type KokoroVoice =
  | 'af_heart' | 'af_alloy' | 'af_aoede' | 'af_bella' | 'af_jessica'
  | 'af_kore'  | 'af_nicole' | 'af_nova' | 'af_river' | 'af_sarah' | 'af_sky'
  | 'am_adam'  | 'am_echo'  | 'am_eric'  | 'am_fenrir' | 'am_liam'
  | 'am_michael' | 'am_onyx' | 'am_puck' | 'am_santa'
  | 'bf_alice' | 'bf_emma'  | 'bf_isabella' | 'bf_lily'
  | 'bm_daniel' | 'bm_fable' | 'bm_george' | 'bm_lewis';

// Gender hint used by the Web Speech fallback when Kokoro is unavailable.
// Derived from the KokoroVoice prefix (position [1]: 'f' → female, 'm' → male).
export type VoiceFallback = 'female' | 'male' | 'neutral';

/** Derives the Web Speech fallback gender from a Kokoro voice ID prefix. */
export function deduceFallback(kokoro: KokoroVoice): VoiceFallback {
  const g = kokoro[1];
  if (g === 'f') return 'female';
  if (g === 'm') return 'male';
  return 'neutral';
}

// Renderer-agnostic voice persona. Pitch and rate are normalised -1.0 to +1.0
// (0 = neutral/default for the gender). Renderers map these to their own units.
export type VoicePersona = {
  gender: 'female' | 'male' | 'neutral';
  accent: 'american' | 'british';
  /** Relative pitch adjustment: -1.0 = lowest, 0 = neutral, +1.0 = highest. */
  pitch: number;
  /** Relative speaking-rate adjustment: -1.0 = slowest, 0 = neutral, +1.0 = fastest. */
  rate: number;
};

// Optional eSpeak-ng synthesiser overrides. All fields map directly to espeak flags.
export type ESpeakConfig = {
  /** Voice variant, e.g. 'en+m3', 'en+f4'. */
  variant?: string;
  /** Raw espeak pitch (0–99, default 50). */
  pitch?: number;
  /** Raw espeak speed in words-per-minute (default ~175). */
  speed?: number;
};

// Full voice specification for an actor or per-line override.
// `persona` drives all renderers by default; renderer-specific fields win when present.
export type ActorVoice = {
  /** Renderer-agnostic description used by Web Speech and eSpeak fallbacks. */
  persona: VoicePersona;
  /** Overrides persona for the Kokoro renderer. */
  kokoro?: KokoroVoice;
  /** Overrides persona for the eSpeak-ng renderer. */
  espeak?: ESpeakConfig;
};

// --- Timeline action types (discriminated union) ---

export type TrackType = 'number' | 'vector' | 'quaternion';
export type LoopStyle = 'once' | 'repeat';

export type KeyframeData = {
  property: string;
  times: number[];
  values: number[];
  trackType: TrackType;
  loop?: LoopStyle;
};

// Move or rotate an actor or the camera via keyframes
export type MoveAction = {
  type: 'move';
  targetId: string;    // actorId or 'camera'
  startTime: number;
  keyframes: KeyframeData;
};

// Play a named animation clip embedded in a GLTF asset
export type AnimateAction = {
  type: 'animate';
  actorId: string;
  startTime: number;
  endTime?: number;    // when omitted the clip plays until the end of the scene
  fadeIn?: number;     // seconds to blend from 0→1 weight on entry (0 = hard cut)
  fadeOut?: number;    // seconds to blend from 1→0 weight before endTime (0 = hard cut)
  animationName: string;
  loop?: LoopStyle;
};

// An actor speaks a line (TTS + optional speech bubble in the renderer)
export type SpeakAction = {
  type: 'speak';
  actorId: string;
  startTime: number;
  text: string;
  /** Per-line voice override. When absent, the actor's default voice is used. */
  voice?: ActorVoice;
};

// Bring an offstage actor into the scene at a position
export type EnterAction = {
  type: 'enter';
  actorId: string;
  startTime: number;
  position: Vec3;
  rotation?: Vec3;
};

// Remove an actor from the visible scene
export type ExitAction = {
  type: 'exit';
  actorId: string;
  startTime: number;
};

// Keyframe a light property over time
export type LightingAction = {
  type: 'lighting';
  lightId: string;
  startTime: number;
  keyframes: KeyframeData;
};

// Keyframe the camera over time
export type CameraAction = {
  type: 'camera';
  startTime: number;
  keyframes: KeyframeData;
};

export type SceneAction =
  | MoveAction
  | AnimateAction
  | SpeakAction
  | EnterAction
  | ExitAction
  | LightingAction
  | CameraAction;
