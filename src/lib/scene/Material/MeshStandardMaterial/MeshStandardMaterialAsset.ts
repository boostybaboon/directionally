import { MeshStandardMaterial } from "three";
import { MaterialAsset } from "../Material/Material";
import { ColorParam } from "$lib/common/Param";

export class MeshStandardMaterialAsset extends MaterialAsset {
    color: ColorParam;

    constructor(color: number = 0xffffff) {
        const material = new MeshStandardMaterial({ color });
        super(material);

        this.color = new ColorParam(
            "Color",
            "https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.color",
            material.color
        );

        // Update material when color changes
        this.color.value = material.color;
    }

    /**
     * Get the underlying Three.js MeshStandardMaterial instance
     */
    getMeshStandardMaterial(): MeshStandardMaterial {
        return this.getMaterial() as MeshStandardMaterial;
    }
} 