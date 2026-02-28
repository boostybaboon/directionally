import * as THREE from 'three';
import type { CameraAsset } from './model/Camera';
import type { LightAsset } from './model/Light';
import type { MeshAsset } from './model/Mesh';
import type { GLTFAsset } from './model/GLTF';
import type { Action } from './model/Action';
import type { SpeechEntry } from '../core/scene/types';

export class Model {
  camera: CameraAsset;
  meshes: MeshAsset[];
  gltfs: GLTFAsset[];
  actions: Action[];
  lights: LightAsset[];
  backgroundColor?: number;
  duration?: number;
  speechEntries: SpeechEntry[];

  constructor(
    camera: CameraAsset,
    meshes: MeshAsset[] = [],
    gltfs: GLTFAsset[] = [],
    actions: Action[] = [],
    lights: LightAsset[] = [],
    backgroundColor?: number,
    speechEntries: SpeechEntry[] = [],
    duration?: number
  ) {
    this.camera = camera;
    this.meshes = meshes;
    this.gltfs = gltfs;
    this.actions = actions;
    this.lights = lights;
    this.backgroundColor = backgroundColor;
    this.speechEntries = speechEntries;
    this.duration = duration;
  }
}