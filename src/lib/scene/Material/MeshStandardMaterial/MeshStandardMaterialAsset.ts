import { MeshStandardMaterial, Color } from "three";
import { MaterialAsset } from "../MaterialAsset";
import { ColorParam, FloatParam, BooleanParam } from "$lib/common/Param";
import type { PropertyDescriptor } from "../../../common/Asset";

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
            "The base color of the material",
            new Color(color)
        );

        this.roughness = new FloatParam(
            "Roughness",
            "How rough the material appears (0 = smooth, 1 = rough)",
            roughness,
            0,
            1,
            (value: number) => {
                if (value < 0 || value > 1) throw new Error("Roughness must be between 0 and 1");
            }
        );

        this.metalness = new FloatParam(
            "Metalness",
            "How metallic the material appears (0 = non-metal, 1 = metal)",
            metalness,
            0,
            1,
            (value: number) => {
                if (value < 0 || value > 1) throw new Error("Metalness must be between 0 and 1");
            }
        );

        this.emissive = new ColorParam(
            "Emissive",
            "The emissive color of the material",
            new Color(emissive)
        );

        this.emissiveIntensity = new FloatParam(
            "Emissive Intensity",
            "Intensity of the emissive light",
            emissiveIntensity,
            0,
            Infinity,
            (value: number) => {
                if (value < 0) throw new Error("Emissive intensity must be non-negative");
            }
        );

        this.wireframe = new BooleanParam(
            "Wireframe",
            "Render geometry as wireframe",
            wireframe
        );

        this.flatShading = new BooleanParam(
            "Flat Shading",
            "Use flat shading instead of smooth shading",
            flatShading
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

    getProperties(): Map<string, PropertyDescriptor> {
        const properties = new Map<string, PropertyDescriptor>();

        // Add color property
        properties.set('color', {
            title: 'Color',
            help: 'The base color of the material',
            type: 'color',
            defaultValue: this.color.defaultValue,
            value: this.color.value,
            onChange: (value: Color) => this.color.value = value
        });

        // Add roughness property
        properties.set('roughness', {
            title: 'Roughness',
            help: 'How rough the material appears (0 = smooth, 1 = rough)',
            type: 'float',
            min: 0,
            max: 1,
            defaultValue: this.roughness.defaultValue,
            value: this.roughness.value,
            onChange: (value: number) => this.roughness.value = value
        });

        // Add metalness property
        properties.set('metalness', {
            title: 'Metalness',
            help: 'How metallic the material appears (0 = non-metal, 1 = metal)',
            type: 'float',
            min: 0,
            max: 1,
            defaultValue: this.metalness.defaultValue,
            value: this.metalness.value,
            onChange: (value: number) => this.metalness.value = value
        });

        // Add emissive property
        properties.set('emissive', {
            title: 'Emissive',
            help: 'The emissive color of the material',
            type: 'color',
            defaultValue: this.emissive.defaultValue,
            value: this.emissive.value,
            onChange: (value: Color) => this.emissive.value = value
        });

        // Add emissiveIntensity property
        properties.set('emissiveIntensity', {
            title: 'Emissive Intensity',
            help: 'Intensity of the emissive light',
            type: 'float',
            min: 0,
            max: Infinity,
            defaultValue: this.emissiveIntensity.defaultValue,
            value: this.emissiveIntensity.value,
            onChange: (value: number) => this.emissiveIntensity.value = value
        });

        // Add wireframe property
        properties.set('wireframe', {
            title: 'Wireframe',
            help: 'Render geometry as wireframe',
            type: 'boolean',
            defaultValue: this.wireframe.defaultValue,
            value: this.wireframe.value,
            onChange: (value: boolean) => this.wireframe.value = value
        });

        // Add flatShading property
        properties.set('flatShading', {
            title: 'Flat Shading',
            help: 'Use flat shading instead of smooth shading',
            type: 'boolean',
            defaultValue: this.flatShading.defaultValue,
            value: this.flatShading.value,
            onChange: (value: boolean) => this.flatShading.value = value
        });

        return properties;
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