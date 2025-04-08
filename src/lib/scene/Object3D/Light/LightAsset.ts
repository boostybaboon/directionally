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
            this._light.intensity
        );

        // Set up a watcher to propagate intensity changes to the underlying light
        Object.defineProperty(this.intensity, 'value', {
            get: () => this._light.intensity,
            set: (value: number) => {
                this._light.intensity = value;
            }
        });
    }

    /**
     * Get the underlying Three.js Light instance
     */
    getLight(): Light {
        return this._light;
    }
} 