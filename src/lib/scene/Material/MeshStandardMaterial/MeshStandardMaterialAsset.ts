import { MeshStandardMaterial, Color } from "three";
import { MaterialAsset } from "../MaterialAsset";
import { ColorParam, FloatParam, BooleanParam } from "$lib/common/Param";

export class MeshStandardMaterialAsset extends MaterialAsset {
    color: ColorParam;
    roughness: FloatParam;
    metalness: FloatParam;
    emissive: ColorParam;
    emissiveIntensity: FloatParam;
    wireframe: BooleanParam;
    flatShading: BooleanParam;

    constructor(
        color: number = 0xffffff,  // Three.js default
        roughness: number = 1.0,   // Three.js default
        metalness: number = 0.0,   // Three.js default
        emissive: number = 0x000000, // Three.js default
        emissiveIntensity: number = 1.0, // Three.js default
        wireframe: boolean = false, // Three.js default
        flatShading: boolean = false // Three.js default
    ) {
        const material = new MeshStandardMaterial({
            color,
            roughness,
            metalness,
            emissive,
            emissiveIntensity,
            wireframe,
            flatShading
        });
        super(material);

        // Expose only the properties we want users to be able to modify
        this.color = new ColorParam(
            "Color",
            "https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.color",
            new Color(color)
        );

        this.roughness = new FloatParam(
            "Roughness",
            "https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.roughness",
            0,  // min
            1,  // max
            1.0 // default matches Three.js
        );

        this.metalness = new FloatParam(
            "Metalness",
            "https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.metalness",
            0,  // min
            1,  // max
            0.0 // default matches Three.js
        );

        this.emissive = new ColorParam(
            "Emissive",
            "https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.emissive",
            new Color(emissive)
        );

        this.emissiveIntensity = new FloatParam(
            "Emissive Intensity",
            "https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.emissiveIntensity",
            0,  // min
            Infinity,  // max
            1.0 // default matches Three.js
        );

        this.wireframe = new BooleanParam(
            "Wireframe",
            "https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.wireframe",
            false
        );

        this.flatShading = new BooleanParam(
            "Flat Shading",
            "https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.flatShading",
            false
        );

        // Set initial values from constructor
        this.color.value = new Color(color);
        this.roughness.value = roughness;
        this.metalness.value = metalness;
        this.emissive.value = new Color(emissive);
        this.emissiveIntensity.value = emissiveIntensity;
        this.wireframe.value = wireframe;
        this.flatShading.value = flatShading;

        // Set up change handlers to update the material
        this.color.onChange = () => this.updateMaterial();
        this.roughness.onChange = () => this.updateMaterial();
        this.metalness.onChange = () => this.updateMaterial();
        this.emissive.onChange = () => this.updateMaterial();
        this.emissiveIntensity.onChange = () => this.updateMaterial();
        this.wireframe.onChange = () => this.updateMaterial();
        this.flatShading.onChange = () => this.updateMaterial();
    }

    /**
     * Get the underlying Three.js MeshStandardMaterial instance
     */
    getMeshStandardMaterial(): MeshStandardMaterial {
        return this.getMaterial() as MeshStandardMaterial;
    }

    /**
     * Update the underlying Three.js material with current parameter values
     */
    private updateMaterial(): void {
        const material = this.getMaterial() as MeshStandardMaterial;
        material.color.copy(this.color.value);
        material.roughness = this.roughness.value;
        material.metalness = this.metalness.value;
        material.emissive.copy(this.emissive.value);
        material.emissiveIntensity = this.emissiveIntensity.value;
        material.wireframe = this.wireframe.value;
        material.flatShading = this.flatShading.value;
        material.needsUpdate = true;
    }
} 