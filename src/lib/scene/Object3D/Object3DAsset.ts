//https://threejs.org/docs/#api/en/core/Object3D

import { Vector3Param } from "$lib/common/Param";
import { Vector3 } from "three";

export class Object3DAsset {
    position: Vector3Param = new Vector3Param(
        "Position",
        "https://threejs.org/docs/index.html#api/en/core/Object3D.position",
        new Vector3(0, 0, 0)
    );

    
}