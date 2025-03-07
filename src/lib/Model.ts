import * as THREE from 'three';

export type Camera = {
  fov: number;
}

export type Asset = {
  type: string;
  [key: string]: any;
};

export type Action = {
  name: string;
  target: string;
  property: string;
  times: number[];
  values: number[];
  loop: THREE.AnimationActionLoopStyles;
  clampWhenFinished: boolean;
};

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