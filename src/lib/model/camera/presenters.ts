import * as THREE from 'three';
import type { IPresentableCamera, PerspectiveCameraData } from './types';
import { CameraType } from './types';

export class PerspectiveCameraPresenter implements IPresentableCamera {
  name: string;
  config: PerspectiveCameraData;

  constructor(name: string, config: PerspectiveCameraData) {
    this.name = name;
    this.config = config;
  }

  getPresentableCamera(aspect: number = window.innerWidth / window.innerHeight): THREE.Camera {
    const camera = new THREE.PerspectiveCamera(
      this.config.fov,
      aspect,
      this.config.near,
      this.config.far
    );
    camera.name = this.name;
    camera.position.set(...this.config.position);
    camera.lookAt(...this.config.lookAt);

    return camera;
  }
}

export const cameraPresenters: { [key: string]: new (name: string, data: any) => IPresentableCamera } = {
  [CameraType.PerspectiveCamera]: PerspectiveCameraPresenter,
  // Add other camera types and their presenters here
}; 