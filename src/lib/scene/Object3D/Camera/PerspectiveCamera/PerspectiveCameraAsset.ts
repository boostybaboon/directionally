//https://threejs.org/docs/#api/en/cameras/PerspectiveCamera 
//Object3D -> Camera -> PerspectiveCamera

import type { Asset } from "$lib/common/Asset";
import { FloatParam } from "$lib/common/Param";
import { CameraAsset } from "../CameraAsset";
import { PerspectiveCamera } from "three";

export class PerspectiveCameraAsset extends CameraAsset implements Asset {
    help: string = "https://threejs.org/docs/#api/en/cameras/PerspectiveCamera";
    private _perspectiveCamera: PerspectiveCamera;
    
    private _fov: FloatParam;
    private _aspect: FloatParam;
    private _near: FloatParam;
    private _far: FloatParam;

    constructor(perspectiveCamera: PerspectiveCamera = new PerspectiveCamera()) {
        super(perspectiveCamera);
        this._perspectiveCamera = perspectiveCamera;

        this._fov = new FloatParam(
            "Field of View",
            "https://threejs.org/docs/index.html#api/en/cameras/PerspectiveCamera.fov",
            0,
            360,
            this._perspectiveCamera.fov
        );

        this._aspect = new FloatParam(
            "Aspect Ratio",
            "https://threejs.org/docs/index.html#api/en/cameras/PerspectiveCamera.aspect",
            Number.MIN_VALUE,
            Number.MAX_VALUE,
            this._perspectiveCamera.aspect
        );

        this._near = new FloatParam(
            "Near Plane",
            "https://threejs.org/docs/index.html#api/en/cameras/PerspectiveCamera.near",
            Number.MIN_VALUE,
            Number.MAX_VALUE,
            this._perspectiveCamera.near,
            (value: number) => {
                if (value >= this._far.value) {
                    throw new Error(`Near plane (${value}) must be less than far plane (${this._far.value}).`);
                }
            }
        );

        this._far = new FloatParam(
            "Far Plane",
            "https://threejs.org/docs/index.html#api/en/cameras/PerspectiveCamera.far",
            Number.MIN_VALUE,
            Number.MAX_VALUE,
            this._perspectiveCamera.far,
            (value: number) => {
                if (value <= this._near.value) {
                    throw new Error(`Far plane (${value}) must be greater than near plane (${this._near.value}).`);
                }
            }
        );
    }

    get fov(): number {
        return this._fov.value;
    }
    set fov(value: number) {
        this._fov.value = value;
        this._updateCamera();
    }

    get aspect(): number {
        return this._aspect.value;
    }
    set aspect(value: number) {
        this._aspect.value = value;
        this._updateCamera();
    }

    get near(): number {
        return this._near.value;
    }
    set near(value: number) {
        this._near.value = value;
        this._updateCamera();
    }

    get far(): number {
        return this._far.value;
    }
    set far(value: number) {
        this._far.value = value;
        this._updateCamera();
    }

    private _updateCamera(): void {
        this._perspectiveCamera.fov = this._fov.value;
        this._perspectiveCamera.aspect = this._aspect.value;
        this._perspectiveCamera.near = this._near.value;
        this._perspectiveCamera.far = this._far.value;
        this._perspectiveCamera.updateProjectionMatrix();
    }

    /**
     * Get the underlying Three.js PerspectiveCamera instance
     * @returns The wrapped PerspectiveCamera instance
     */
    getPerspectiveCamera(): PerspectiveCamera {
        return this._perspectiveCamera;
    }
}