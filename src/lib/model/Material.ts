import * as THREE from 'three';

export abstract class MaterialAsset {
    abstract get threeMaterial(): THREE.Material;
}

export class MeshStandardMaterialAsset extends MaterialAsset {
    private _threeMaterial: THREE.MeshStandardMaterial;
    
    constructor(
        public readonly color: number,
        public readonly emissive?: number,
        public readonly metalness?: number,
        public readonly roughness?: number
    ) {
        super();
        this._threeMaterial = new THREE.MeshStandardMaterial();
        this._threeMaterial.color.setHex(color);
        
        if (emissive !== undefined) {
            this._threeMaterial.emissive.setHex(emissive);
        }
        if (metalness !== undefined) {
            this._threeMaterial.metalness = metalness;
        }
        if (roughness !== undefined) {
            this._threeMaterial.roughness = roughness;
        }
    }

    get threeMaterial(): THREE.MeshStandardMaterial {
        return this._threeMaterial;
    }
} 