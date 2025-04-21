import * as THREE from 'three';

export abstract class Object3DAsset {
    protected _threeObject: THREE.Object3D;
    protected _position: THREE.Vector3;
    protected _rotation: THREE.Euler;
    protected _scale: THREE.Vector3;
    protected _parent?: string;
    
    constructor(public readonly name: string) {
        this._position = new THREE.Vector3(0, 0, 0);
        this._rotation = new THREE.Euler(0, 0, 0);
        this._scale = new THREE.Vector3(1, 1, 1);
    }

    get threeObject(): THREE.Object3D {
        return this._threeObject;
    }

    get position(): THREE.Vector3 {
        return this._position;
    }

    set position(value: THREE.Vector3) {
        this._position.copy(value);
        this._threeObject.position.copy(value);
    }

    get rotation(): THREE.Euler {
        return this._rotation;
    }

    set rotation(value: THREE.Euler) {
        this._rotation.copy(value);
        this._threeObject.rotation.copy(value);
    }

    get scale(): THREE.Vector3 {
        return this._scale;
    }

    set scale(value: THREE.Vector3) {
        this._scale.copy(value);
        this._threeObject.scale.copy(value);
    }

    get parent(): string | undefined {
        return this._parent;
    }

    set parent(value: string | undefined) {
        this._parent = value;
    }

    protected initializeThreeObject(): void {
        this._threeObject.name = this.name;
        this._threeObject.position.copy(this._position);
        this._threeObject.rotation.copy(this._rotation);
        this._threeObject.scale.copy(this._scale);
    }
} 