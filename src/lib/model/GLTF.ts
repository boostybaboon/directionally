import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class GLTFAsset {
  private _threeObject: THREE.Object3D;
  private _animations: THREE.AnimationClip[];
  private _position: THREE.Vector3;
  private _rotation: THREE.Euler;
  private _parent?: string;
  
  constructor(
    public readonly name: string,
    public readonly url: string,
    position: THREE.Vector3,
    rotation: THREE.Euler,
    parent?: string
  ) {
    this._threeObject = new THREE.Object3D();
    this._threeObject.name = name;
    this._animations = [];
    this._position = position.clone();
    this._rotation = rotation.clone();
    this._parent = parent;
    
    this._threeObject.position.copy(this._position);
    this._threeObject.rotation.copy(this._rotation);
  }

  get threeObject(): THREE.Object3D {
    return this._threeObject;
  }

  get animations(): THREE.AnimationClip[] {
    return this._animations;
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

  public async load(): Promise<void> {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync(this.url);
      this._threeObject = gltf.scene;
      this._animations = gltf.animations;
      this._threeObject.name = this.name;
      this._threeObject.position.copy(this._position);
      this._threeObject.rotation.copy(this._rotation);
    } catch (error) {
      console.error('Failed to load GLTF model:', error);
      // Keep the fallback empty Object3D
    }
  }

  updatePosition(position: THREE.Vector3): void {
    this._position.copy(position);
    this._threeObject.position.copy(position);
  }

  updateRotation(rotation: THREE.Euler): void {
    this._rotation.copy(rotation);
    this._threeObject.rotation.copy(rotation);
  }
} 