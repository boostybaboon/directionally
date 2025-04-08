import { DirectionalLight } from "three";
import { LightAsset } from "../LightAsset";

export class DirectionalLightAsset extends LightAsset {
    private _directionalLight: DirectionalLight;

    constructor() {
        const light = new DirectionalLight();
        super(light);
        this._directionalLight = light;
    }

    /**
     * Get the underlying Three.js DirectionalLight instance
     */
    getDirectionalLight(): DirectionalLight {
        return this._directionalLight;
    }
} 