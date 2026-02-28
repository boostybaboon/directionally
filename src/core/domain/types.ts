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
  animationName: string;
  loop?: LoopStyle;
};

// An actor speaks a line (TTS + optional speech bubble in the renderer)
export type SpeakAction = {
  type: 'speak';
  actorId: string;
  startTime: number;
  text: string;
  voice?: string;
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
