import { Light } from "three";
import { Object3DAsset } from "../Object3DAsset";
import { ColorParam, IntensityParam } from "$lib/common/Param";

export class LightAsset extends Object3DAsset {
    private _light: Light;
    color: ColorParam;
    intensity: IntensityParam;

    constructor(light: Light) {
        super(light);
        this._light = light;
        
        this.color = new ColorParam(
            "Color",
            "https://threejs.org/docs/index.html#api/en/lights/Light.color",
            this._light.color
        );
        
        this.intensity = new IntensityParam(
            "Intensity",
            "https://threejs.org/docs/index.html#api/en/lights/Light.intensity",
            1  // Default intensity
        );

        // Set up watchers to propagate changes to the underlying light
        this.color.onChange = () => this.updateLight();
        this.intensity.onChange = () => this.updateLight();

        // Initialize light properties
        this.updateLight();
    }

    /**
     * Update the underlying Three.js light with current parameter values
     */
    protected updateLight(): void {
        this._light.color.copy(this.color.value);
        this._light.intensity = this.intensity.value;
    }

    /**
     * Get the underlying Three.js Light instance
     */
    getLight(): Light {
        return this._light;
    }
} 