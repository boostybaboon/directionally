import { Light } from "three";
import { Object3DAsset } from "../Object3DAsset";
import { ColorParam } from "$lib/common/Param";

export class LightAsset extends Object3DAsset {
    private _light: Light;
    color: ColorParam;
    intensity: number;

    constructor(light: Light) {
        super(light);
        this._light = light;
        
        this.color = new ColorParam(
            "Color",
            "https://threejs.org/docs/index.html#api/en/lights/Light.color",
            this._light.color
        );
        
        this.intensity = this._light.intensity;
    }

    /**
     * Get the underlying Three.js Light instance
     */
    getLight(): Light {
        return this._light;
    }

    /**
     * Set the light's intensity
     * @param value The new intensity value
     */
    setIntensity(value: number): void {
        this.intensity = value;
        this._light.intensity = value;
    }
} 