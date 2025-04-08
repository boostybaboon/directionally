import { HemisphereLight, Color } from "three";
import { LightAsset } from "../LightAsset";
import { ColorParam } from "$lib/common/Param";

export class HemisphereLightAsset extends LightAsset {
    private _hemisphereLight: HemisphereLight;
    groundColor: ColorParam;

    constructor() {
        // In Three.js HemisphereLight, the main color is sky color
        const skyColor = new Color(0xffffff); // White
        const groundColor = new Color(0xffffff); // White
        const light = new HemisphereLight(skyColor, groundColor, 1); // Default intensity of 1
        super(light);
        this._hemisphereLight = light;

        this.groundColor = new ColorParam(
            "Ground Color",
            "https://threejs.org/docs/#api/en/lights/HemisphereLight.groundColor",
            this._hemisphereLight.groundColor
        );

        // Set up watcher to propagate groundColor changes to the underlying light
        this.groundColor.onChange = () => {
            this._hemisphereLight.groundColor.copy(this.groundColor.value);
        };
    }

    /**
     * Get the underlying Three.js HemisphereLight instance
     */
    getHemisphereLight(): HemisphereLight {
        return this._hemisphereLight;
    }
} 