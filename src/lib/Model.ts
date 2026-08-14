import * as THREE from 'three';
import type { CameraAsset } from './model/Camera';
import type { LightAsset } from './model/Light';
import type { MeshAsset } from './model/Mesh';
import type { GLTFAsset } from './model/GLTF';
import type { Action } from './model/Action';
import type { SpeechEntry } from '../core/scene/types';

/**
 * An actor whose cast name did not resolve to a real catalogue entry
 * (Track CAT, CAT-1). Rendered with a persistent lozenge label above the
 * head so the placeholder is never mistaken for a deliberately-cast character.
 */
export type PlaceholderActor = {
  actorId: string;
  /** The typed cast name (role), shown in the lozenge label. */
  label: string;
};

/**
 * A scene setting whose name did not resolve to a catalogue set piece or
 * environment (Track CAT, CAT-2). The renderer draws the typed name onto the
 * placeholder room floor so the room is unmistakably a placeholder.
 */
export type PlaceholderSetting = {
  /** The typed setting name (e.g. "CLASSROOM"). */
  label: string;
};

export class Model {
  camera: CameraAsset;
  meshes: MeshAsset[];
  gltfs: GLTFAsset[];
  actions: Action[];
  lights: LightAsset[];
  backgroundColor?: number;
  duration?: number;
  speechEntries: SpeechEntry[];
  environmentMap?: string;
  placeholderActors: PlaceholderActor[];
  placeholderSetting?: PlaceholderSetting;

  constructor(
    camera: CameraAsset,
    meshes: MeshAsset[] = [],
    gltfs: GLTFAsset[] = [],
    actions: Action[] = [],
    lights: LightAsset[] = [],
    backgroundColor?: number,
    speechEntries: SpeechEntry[] = [],
    duration?: number,
    environmentMap?: string,
    placeholderActors: PlaceholderActor[] = [],
    placeholderSetting?: PlaceholderSetting,
  ) {
    this.camera = camera;
    this.meshes = meshes;
    this.gltfs = gltfs;
    this.actions = actions;
    this.lights = lights;
    this.backgroundColor = backgroundColor;
    this.speechEntries = speechEntries;
    this.duration = duration;
    this.environmentMap = environmentMap;
    this.placeholderActors = placeholderActors;
    this.placeholderSetting = placeholderSetting;
  }
}

