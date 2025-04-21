import * as THREE from 'three';

export class Object3DAsset {
    protected _threeObject: THREE.Object3D;
    protected _position: THREE.Vector3;
    protected _rotation: THREE.Euler;
    protected _scale: THREE.Vector3;
    protected _parent?: string;
    protected _lookAt?: THREE.Vector3;
    
    constructor(
        public readonly name: string,
        threeObject?: THREE.Object3D
    ) {
        this._threeObject = threeObject ?? new THREE.Object3D();
        this._threeObject.name = name;
        this._position = this._threeObject.position;
        this._rotation = this._threeObject.rotation;
        this._scale = this._threeObject.scale;
    }

    get threeObject(): THREE.Object3D {
        return this._threeObject;
    }

    get position(): THREE.Vector3 {
        return this._position;
    }

    set position(value: THREE.Vector3) {
        this._position.copy(value);
    }

    get rotation(): THREE.Euler {
        return this._rotation;
    }

    set rotation(value: THREE.Euler) {
        this._rotation.copy(value);
    }

    get scale(): THREE.Vector3 {
        return this._scale;
    }

    set scale(value: THREE.Vector3) {
        this._scale.copy(value);
    }

    get parent(): string | undefined {
        return this._parent;
    }

    set parent(value: string | undefined) {
        this._parent = value;
    }

    get lookAt(): THREE.Vector3 | undefined {
        return this._lookAt;
    }

    set lookAt(value: THREE.Vector3 | undefined) {
        this._lookAt = value;
        if (value) {
            this._threeObject.lookAt(value);
        }
    }
} 