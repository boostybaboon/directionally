import { Material, FrontSide, BackSide, DoubleSide } from "three";
import { FloatParam, BooleanParam, IntParam } from "$lib/common/Param";

export class MaterialAsset {
    private _material: Material;
    opacity: FloatParam;
    transparent: BooleanParam;
    visible: BooleanParam;
    side: IntParam;
    private _needsUpdateInternal: boolean = false;
    needsUpdate: BooleanParam;

    constructor(material: Material) {
        this._material = material;

        // Initialize parameters with Three.js defaults
        this.opacity = new FloatParam(
            "Opacity",
            "https://threejs.org/docs/#api/en/materials/Material.opacity",
            0,  // min
            1,  // max
            1.0 // default matches Three.js
        );

        this.transparent = new BooleanParam(
            "Transparent",
            "https://threejs.org/docs/#api/en/materials/Material.transparent",
            false // default matches Three.js
        );

        this.visible = new BooleanParam(
            "Visible",
            "https://threejs.org/docs/#api/en/materials/Material.visible",
            true // default matches Three.js
        );

        this.side = new IntParam(
            "Side",
            "https://threejs.org/docs/#api/en/materials/Material.side",
            0,  // min (FrontSide = 0)
            2,  // max (DoubleSide = 2)
            FrontSide // default matches Three.js
        );

        this.needsUpdate = new BooleanParam(
            "Needs Update",
            "https://threejs.org/docs/#api/en/materials/Material.needsUpdate",
            false // default matches Three.js
        );

        // Set up change handlers
        this.opacity.onChange = (value) => {
            this._material.opacity = value;
            // If opacity is less than 1, material should be transparent
            if (value < 1.0 && !this._material.transparent) {
                this._material.transparent = true;
                this.transparent.value = true;
            }
        };

        this.transparent.onChange = (value) => {
            this._material.transparent = value;
        };

        this.visible.onChange = (value) => {
            this._material.visible = value;
        };

        this.side.onChange = (value) => {
            // Validate that value is one of the valid side constants
            if (![FrontSide, BackSide, DoubleSide].includes(value)) {
                throw new Error("Invalid side value. Must be FrontSide (0), BackSide (1), or DoubleSide (2)");
            }
            this._material.side = value;
        };

        this.needsUpdate.onChange = (value) => {
            if (value) {
                this._material.needsUpdate = true;
                this._needsUpdateInternal = true;
            } else {
                this._needsUpdateInternal = false;
            }
        };
    }

    /**
     * Get the underlying Three.js Material instance
     */
    getMaterial(): Material {
        return this._material;
    }
} 