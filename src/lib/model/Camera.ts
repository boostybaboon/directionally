import * as THREE from 'three';
import { Object3DAsset } from './Object3DAsset';

export class CameraAsset extends Object3DAsset {
    protected _threeCamera: THREE.Camera;
    
    constructor(
        name: string,
        threeCamera?: THREE.Camera
    ) {
        super(name, threeCamera);
        this._threeCamera = this._threeObject as THREE.Camera;
    }

    get threeCamera(): THREE.Camera {
        return this._threeCamera;
    }
}

export class PerspectiveCameraAsset extends CameraAsset {
    private _perspectiveCamera: THREE.PerspectiveCamera;
    
    constructor(
        name: string,
        public fov: number,
        public readonly near: number,
        public readonly far: number
    ) {
        const camera = new THREE.PerspectiveCamera(fov, 1, near, far);
        super(name, camera);
        this._perspectiveCamera = this._threeObject as THREE.PerspectiveCamera;
    }

    get threeCamera(): THREE.PerspectiveCamera {
        return this._perspectiveCamera;
    }

    updateFov(fov: number): void {
        this.fov = fov;
        this._perspectiveCamera.fov = fov;
        this._perspectiveCamera.updateProjectionMatrix();
    }
} 