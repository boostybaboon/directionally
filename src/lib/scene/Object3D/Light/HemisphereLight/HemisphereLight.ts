import { HemisphereLight } from "three";
import { LightAsset } from "../LightAsset";
import { ColorParam } from "$lib/common/Param";

export class HemisphereLightAsset extends LightAsset {
    private _hemisphereLight: HemisphereLight;
    groundColor: ColorParam;

    constructor() {
        // In Three.js HemisphereLight, the main color is sky color
        const light = new HemisphereLight();
        super(light);
        this._hemisphereLight = light;

        this.groundColor = new ColorParam(
            "Ground Color",
            "https://threejs.org/docs/#api/en/lights/HemisphereLight.groundColor",
            this._hemisphereLight.groundColor
        );
    }

    /**
     * Get the underlying Three.js HemisphereLight instance
     */
    getHemisphereLight(): HemisphereLight {
        return this._hemisphereLight;
    }
} 