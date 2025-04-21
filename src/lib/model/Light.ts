import * as THREE from 'three';
import { Object3DAsset } from './Object3DAsset';

export class LightAsset extends Object3DAsset {
    protected _threeLight: THREE.Light;

    constructor(name: string, threeLight: THREE.Light) {
        super(name, threeLight);
        this._threeLight = threeLight;
    }

    get color(): number {
        return this._threeLight.color.getHex();
    }

    set color(value: number) {
        this._threeLight.color.setHex(value);
    }

    get intensity(): number {
        return this._threeLight.intensity;
    }

    set intensity(value: number) {
        this._threeLight.intensity = value;
    }
}

export class DirectionalLightAsset extends LightAsset {
    private _directionalLight: THREE.DirectionalLight;

    constructor(name: string, color: number, intensity: number) {
        const light = new THREE.DirectionalLight(color, intensity);
        super(name, light);
        this._directionalLight = light;
    }

    get target(): THREE.Vector3 {
        return this._directionalLight.target.position;
    }

    set target(value: THREE.Vector3) {
        this._directionalLight.target.position.copy(value);
    }
}

export class HemisphereLightAsset extends LightAsset {
    private _hemisphereLight: THREE.HemisphereLight;

    constructor(name: string, skyColor: number, groundColor: number, intensity: number) {
        const light = new THREE.HemisphereLight(skyColor, groundColor, intensity);
        super(name, light);
        this._hemisphereLight = light;
    }

    get groundColor(): number {
        return this._hemisphereLight.groundColor.getHex();
    }

    set groundColor(value: number) {
        this._hemisphereLight.groundColor.setHex(value);
    }
}

export class SpotLightAsset extends LightAsset {
    private _spotLight: THREE.SpotLight;

    constructor(name: string, color: number, intensity: number, angle: number, penumbra: number, decay: number) {
        const light = new THREE.SpotLight(color, intensity, 0, angle, penumbra, decay);
        super(name, light);
        this._spotLight = light;
    }

    get target(): THREE.Vector3 {
        return this._spotLight.target.position;
    }

    set target(value: THREE.Vector3) {
        this._spotLight.target.position.copy(value);
    }

    get angle(): number {
        return this._spotLight.angle;
    }

    set angle(value: number) {
        this._spotLight.angle = value;
    }

    get penumbra(): number {
        return this._spotLight.penumbra;
    }

    set penumbra(value: number) {
        this._spotLight.penumbra = value;
    }

    get decay(): number {
        return this._spotLight.decay;
    }

    set decay(value: number) {
        this._spotLight.decay = value;
    }
} 