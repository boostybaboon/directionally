// Pure domain config types — no Three.js or Tone.js imports

export type Vec3 = [number, number, number];

export type GeometryConfig =
  | { type: 'box';      width: number; height: number; depth: number }
  | { type: 'plane';    width: number; height: number }
  | { type: 'sphere';   radius: number; widthSegments?: number; heightSegments?: number }
  | { type: 'cylinder'; radiusTop: number; radiusBottom: number; height: number; radialSegments?: number };

export type MaterialConfig = {
  color: number;
  emissive?: number;
  metalness?: number;
  roughness?: number;
  /** URL to a texture image (e.g. '/textures/brick.jpg'). Loaded by the renderer via TextureLoader. */
  textureUrl?: string;
  /** Horizontal repeat count for the texture. Defaults to 1. */
  repeatU?: number;
  /** Vertical repeat count for the texture. Defaults to 1. */
  repeatV?: number;
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
  startScale?: Vec3;     // uniform scale applied at spawn; derived from catalogue defaultScale
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

// Optional eSpeak-ng synthesiser overrides. Parameter units match the raw eSpeak-NG C API.
export type ESpeakConfig = {
  /** eSpeak-NG voice ID, e.g. 'en-us' (American) or 'en-gb-x-rp' (British RP). Default: 'en-us'. */
  voice?: string;
  /** Pitch: 0–99 integer, default 50. Higher = higher pitch. */
  pitch?: number;
  /** Pitch range / expressiveness: 0–99 integer, default 50. Higher = more animated intonation. */
  pitchRange?: number;
  /** Speaking rate in words-per-minute, default 175. */
  rate?: number;
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
export type TransformTrack = {
  type: 'move';
  targetId: string;    // actorId or 'camera'
  startTime: number;
  keyframes: KeyframeData;
};

// Play a named animation clip embedded in a GLTF asset
export type ClipTrack = {
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
  /** Authoring hint: gap after this line before the next starts (seconds). Stored
   *  for round-trip fidelity; does not affect playback (baked into startTime). */
  pauseAfter?: number;
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
export type LightingTrack = {
  type: 'lighting';
  lightId: string;
  startTime: number;
  keyframes: KeyframeData;
};

// Keyframe the camera over time (raw KeyframeData; prefer CameraTrackAction for new authoring)
export type CameraAction = {
  type: 'camera';
  startTime: number;
  keyframes: KeyframeData;
};

/**
 * A single spatial keyframe used by camera tracks and (in future) character movement paths.
 * `lookAt` is the world-space point the camera (or actor) faces at this moment.
 */
export type PathKeyframe = { time: number; position: Vec3; lookAt: Vec3 };

/**
 * Animate the playback camera through a sequence of position + lookAt keyframes.
 * The path is baked into VectorKeyframeTrack (position) + QuaternionKeyframeTrack
 * (quaternion derived from lookAt) at scene-build time — no render-loop lookAt() needed.
 * The PathKeyframe type is intentionally shared with future character MovePath actions.
 */
export type CameraTrackAction = {
  type: 'cameraTrack';
  keyframes: PathKeyframe[];
};

export type SceneAction =
  | TransformTrack
  | ClipTrack
  | SpeakAction
  | EnterAction
  | ExitAction
  | LightingTrack
  | CameraAction
  | CameraTrackAction;

// ── Block types (high-level authored primitives, compiled to Tracks at playback) ──

/**
 * A character's activity in a time window: the clip to play, the movement
 * path, and the facing direction. Compiled to ClipTrack + TransformTrack(s)
 * at playback time by `actorBlockToTracks` — never stored as raw Tracks.
 */
export type ActorBlock = {
  type: 'actorBlock';
  actorId: string;
  startTime: number;
  endTime: number;
  /** Clip name to play; omit → idle / hold last pose. */
  clip?: string;
  /** World position at startTime; omit → inherit previous block's endPosition. */
  startPosition?: Vec3;
  /** World position at endTime; omit → stay at startPosition (stationary). */
  endPosition?: Vec3;
  /** Facing direction vector at startTime; omit → inherit. */
  startFacing?: Vec3;
  /** Facing direction vector at endTime; omit → auto: face travel direction, or forward if stationary. */
  endFacing?: Vec3;
  /** Loop behaviour for the clip: 'once' plays the animation once and holds the last frame;
   *  'repeat' (default) loops indefinitely within the block window. */
  clipLoop?: LoopStyle;
};

/**
 * A light's intensity envelope in a time window.
 * Compiled to a LightingTrack at playback time — never stored as a raw Track.
 */
export type LightBlock = {
  type: 'lightBlock';
  lightId: string;
  startTime: number;
  endTime: number;
  startIntensity?: number;
  endIntensity?: number;
};

/**
 * Animate the camera through a position + lookAt transition.
 * Compiled to a CameraTrackAction at playback time — never stored as a raw Track.
 * Start position/lookAt are inferred from the scene's CameraConfig or the
 * previous CameraBlock's end state.
 */
export type CameraBlock = {
  type: 'cameraBlock';
  startTime: number;
  endTime: number;
  /** Camera end position; omit → stay at inferred start position. */
  endPosition?: Vec3;
  /** Camera lookAt end point; omit → stay at inferred start lookAt. */
  endLookAt?: Vec3;
};

/**
 * Animate a set piece's position and/or rotation over a time window.
 * Compiled to TransformTrack(s) at playback time — never stored as raw Tracks.
 * Start state is inferred from the SetPiece config or the previous SetPieceBlock's
 * end state for the same targetId.
 */
export type SetPieceBlock = {
  type: 'setPieceBlock';
  /** Must match SetPiece.name exactly. */
  targetId: string;
  startTime: number;
  endTime: number;
  /** Set piece end position; omit → stay at inferred start position. */
  endPosition?: Vec3;
  /** Set piece end rotation (Euler XYZ, radians); omit → stay at inferred start rotation. */
  endRotation?: Vec3;
};

export type Block = ActorBlock | LightBlock | CameraBlock | SetPieceBlock;
