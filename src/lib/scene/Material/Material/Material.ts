import { Material } from "three";

export class MaterialAsset {
    private _material: Material;

    constructor(material: Material) {
        this._material = material;
    }

    /**
     * Get the underlying Three.js Material instance
     */
    getMaterial(): Material {
        return this._material;
    }
} 