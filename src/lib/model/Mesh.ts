import * as THREE from 'three';
import { GeometryAsset } from './Geometry';
import { MaterialAsset } from './Material';

export class MeshAsset {
    private _threeMesh: THREE.Mesh;
    private _position: THREE.Vector3;
    private _rotation: THREE.Euler;
    private _parent?: string;
    
    constructor(
        public readonly name: string,
        geometry: GeometryAsset,
        material: MaterialAsset,
        position: THREE.Vector3,
        rotation: THREE.Euler,
        parent?: string
    ) {
        this._threeMesh = new THREE.Mesh(geometry.threeGeometry, material.threeMaterial);
        this._threeMesh.name = name;
        
        this._position = position.clone();
        this._rotation = rotation.clone();
        
        this._threeMesh.position.copy(this._position);
        this._threeMesh.rotation.copy(this._rotation);
        
        this._parent = parent;
    }

    get threeMesh(): THREE.Mesh {
        return this._threeMesh;
    }

    get position(): THREE.Vector3 {
        return this._position;
    }

    get rotation(): THREE.Euler {
        return this._rotation;
    }

    get parent(): string | undefined {
        return this._parent;
    }

    updatePosition(position: THREE.Vector3): void {
        this._position.copy(position);
        this._threeMesh.position.copy(position);
    }

    updateRotation(rotation: THREE.Euler): void {
        this._rotation.copy(rotation);
        this._threeMesh.rotation.copy(rotation);
    }
} 