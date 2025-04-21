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
        const threeMesh = new THREE.Mesh(geometry.threeGeometry, material.threeMaterial);
        super(name, threeMesh);
        this._threeMesh = threeMesh;
    }

    get threeMesh(): THREE.Mesh {
        return this._threeMesh;
    }
} 