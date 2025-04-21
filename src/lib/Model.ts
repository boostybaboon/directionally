import * as THREE from 'three';
import type { CameraAsset } from './model/Camera';
import type { LightAsset } from './model/Light';
import type { MeshAsset } from './model/Mesh';
import type { GLTFAsset } from './model/GLTF';
import type { Action } from './model/Action';

export class Model {
  camera: CameraAsset;
  meshes: MeshAsset[];
  gltfs: GLTFAsset[];
  actions: Action[];
  lights: LightAsset[];
  backgroundColor?: number;

  constructor(
    camera: CameraAsset, 
    meshes: MeshAsset[] = [],
    gltfs: GLTFAsset[] = [],
    actions: Action[] = [], 
    lights: LightAsset[] = [],
    backgroundColor?: number
  ) {
    this.camera = camera;
    this.meshes = meshes;
    this.gltfs = gltfs;
    this.actions = actions;
    this.lights = lights;
    this.backgroundColor = backgroundColor;
  }
}