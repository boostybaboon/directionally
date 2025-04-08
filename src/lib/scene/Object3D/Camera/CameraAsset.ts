//https://threejs.org/docs/#api/en/cameras/Camera
//Object3D -> Camera

import { Object3DAsset } from "../Object3DAsset";
import { Camera } from "three";

export class CameraAsset extends Object3DAsset {
    private _camera: Camera;

    constructor(camera: Camera) {
        super(camera);
        this._camera = camera;
    }

    /**
     * Get the underlying Three.js Camera instance
     * @returns The wrapped Camera instance
     */
    getCamera(): Camera {
        return this._camera;
    }
}