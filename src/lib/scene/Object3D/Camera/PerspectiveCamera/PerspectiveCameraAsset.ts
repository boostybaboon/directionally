//https://threejs.org/docs/#api/en/cameras/PerspectiveCamera 
//Object3D -> Camera -> PerspectiveCamera

import type { Asset } from "$lib/common/Asset";
import { FloatParam } from "$lib/common/Param";
import { CameraAsset } from "../CameraAsset";

export class PerspectiveCameraAsset extends CameraAsset implements Asset{
    help: string = "https://threejs.org/docs/#api/en/cameras/PerspectiveCamera";
    fov: FloatParam = new FloatParam(
        "Field of View",
        "https://threejs.org/docs/index.html#api/en/cameras/PerspectiveCamera.fov",
        0,
        360,
        50
    );
    aspect: FloatParam = new FloatParam(
        "Aspect Ratio",
        "https://threejs.org/docs/index.html#api/en/cameras/PerspectiveCamera.aspect",
        Number.MIN_VALUE,
        Number.MAX_VALUE,
        1
    );
    near: FloatParam = new FloatParam(
        "Near Plane",
        "https://threejs.org/docs/index.html#api/en/cameras/PerspectiveCamera.near",
        Number.MIN_VALUE,
        Number.MAX_VALUE,
        0.1,
        (value: number) => {
            if (value >= this.far.value) {
                throw new Error(`Near plane (${value}) must be less than far plane (${this.far.value}).`);
            }
        }
    );
    far: FloatParam = new FloatParam(
        "Far Plane",
        "https://threejs.org/docs/index.html#api/en/cameras/PerspectiveCamera.far",
        Number.MIN_VALUE,
        Number.MAX_VALUE,
        2000,
        (value: number) => {
            if (value <= this.near.value) {
                throw new Error(`Far plane (${value}) must be greater than near plane (${this.near.value}).`);
            }
        }
    );
}