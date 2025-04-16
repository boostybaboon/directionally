import type { Camera } from './camera';
import type { Asset } from './types';
import type { Action } from './animation/types';

export class Model {
  camera: Camera;
  assets: Asset[];
  actions: Action[];

  constructor(camera: Camera, sceneElements: Asset[], animations: Action[]) {
    this.camera = camera;
    this.assets = sceneElements;
    this.actions = animations;
  }
}

export * from './types';
export * from './camera';
export * from './light';
export * from './geometry';
export * from './material';
export * from './mesh';
export * from './gltf';
export * from './animation'; 