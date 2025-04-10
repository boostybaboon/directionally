//https://threejs.org/docs/#api/en/cameras/PerspectiveCamera 
//Object3D -> Camera -> PerspectiveCamera

import type { Asset } from "$lib/common/Asset";
import { FloatParam } from "$lib/common/Param";
import { CameraAsset } from "../CameraAsset";
import { PerspectiveCamera, Vector3 } from "three";

export class PerspectiveCameraAsset extends CameraAsset implements Asset {
    help: string = "https://threejs.org/docs/#api/en/cameras/PerspectiveCamera";
    private _perspectiveCamera: PerspectiveCamera;
    
    // Private parameters
    private readonly _fov: FloatParam;
    private readonly _near: FloatParam;
    private readonly _far: FloatParam;

    constructor(camera?: PerspectiveCamera) {
        const perspectiveCamera = camera || new PerspectiveCamera(50, 1, 0.1, 2000);
        super(perspectiveCamera);
        this._perspectiveCamera = perspectiveCamera;

        this._fov = new FloatParam('Field of View', 'Camera frustum vertical field of view', perspectiveCamera.fov, 0, 180);
        this._near = new FloatParam('Near Plane', 'Camera frustum near plane', perspectiveCamera.near, 0, undefined, (value: number) => {
            if (value >= this._far.value) {
                throw new Error(`Near plane (${value}) must be less than far plane (${this._far.value}).`);
            }
        });
        this._far = new FloatParam('Far Plane', 'Camera frustum far plane', perspectiveCamera.far, 0, undefined, (value: number) => {
            if (value <= this._near.value) {
                throw new Error(`Far plane (${value}) must be greater than near plane (${this._near.value}).`);
            }
        });

        this._fov.onChange = (value: number) => {
            this._perspectiveCamera.fov = value;
            this._perspectiveCamera.updateProjectionMatrix();
        };

        this._near.onChange = (value: number) => {
            this._perspectiveCamera.near = value;
            this._perspectiveCamera.updateProjectionMatrix();
        };

        this._far.onChange = (value: number) => {
            this._perspectiveCamera.far = value;
            this._perspectiveCamera.updateProjectionMatrix();
        };

        // Initialize the camera with the parameter values
        this._perspectiveCamera.fov = this._fov.value;
        this._perspectiveCamera.near = this._near.value;
        this._perspectiveCamera.far = this._far.value;
        this._perspectiveCamera.updateProjectionMatrix();
    }

    // Getters and setters for camera properties
    get fov(): number {
        return this._fov.value;
    }

    set fov(value: number) {
        this._fov.value = value;
    }

    get near(): number {
        return this._near.value;
    }

    set near(value: number) {
        this._near.value = value;
    }

    get far(): number {
        return this._far.value;
    }

    set far(value: number) {
        this._far.value = value;
    }

    /**
     * Update the camera's aspect ratio based on the viewport dimensions
     * @param width The width of the viewport
     * @param height The height of the viewport
     */
    updateAspectRatio(width: number, height: number): void {
        this._perspectiveCamera.aspect = width / height;
        this._perspectiveCamera.updateProjectionMatrix();
    }

    /**
     * Point the camera at a specific position
     * @param target The target position to look at
     */
    lookAt(target: Vector3): void {
        this._perspectiveCamera.lookAt(target);
    }

    /**
     * Get the underlying Three.js PerspectiveCamera instance
     * @returns The wrapped PerspectiveCamera instance
     */
    getPerspectiveCamera(): PerspectiveCamera {
        return this._perspectiveCamera;
    }
}