import * as THREE from 'three';
import { GeometryAsset } from './Geometry';
import { MaterialAsset } from './Material';
import { Object3DAsset } from './Object3DAsset';

export class MeshAsset extends Object3DAsset {
    private _threeMesh: THREE.Mesh;
    
    constructor(
        name: string,
        geometry: GeometryAsset,
        material: MaterialAsset
    ) {
        super(name);
        this._threeMesh = new THREE.Mesh(geometry.threeGeometry, material.threeMaterial);
        this._threeObject = this._threeMesh;
        this.initializeThreeObject();
    }

    get threeMesh(): THREE.Mesh {
        return this._threeMesh;
    }
} 