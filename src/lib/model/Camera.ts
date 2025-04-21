import * as THREE from 'three';

export abstract class CameraAsset {
  abstract get threeCamera(): THREE.Camera;
}

export class PerspectiveCameraAsset extends CameraAsset {
  private _threeCamera: THREE.PerspectiveCamera;
  private _position: THREE.Vector3;
  private _lookAt: THREE.Vector3;
  
  constructor(
    public readonly name: string,
    public fov: number,
    public readonly near: number,
    public readonly far: number,
    position: THREE.Vector3,
    lookAt: THREE.Vector3
  ) {
    super();
    this._threeCamera = new THREE.PerspectiveCamera(fov, 1, near, far); // Default aspect of 1
    this._threeCamera.name = name;
    
    this._position = position.clone();
    this._lookAt = lookAt.clone();
    
    this._threeCamera.position.copy(this._position);
    this._threeCamera.lookAt(this._lookAt);
  }

  get threeCamera(): THREE.PerspectiveCamera {
    return this._threeCamera;
  }

  get position(): THREE.Vector3 {
    return this._position;
  }

  get lookAt(): THREE.Vector3 {
    return this._lookAt;
  }

  updatePosition(position: THREE.Vector3): void {
    this._position.copy(position);
    this._threeCamera.position.copy(position);
  }

  updateLookAt(lookAt: THREE.Vector3): void {
    this._lookAt.copy(lookAt);
    this._threeCamera.lookAt(lookAt);
  }

  updateFov(fov: number): void {
    this.fov = fov;
    this._threeCamera.fov = fov;
    this._threeCamera.updateProjectionMatrix();
  }
} 