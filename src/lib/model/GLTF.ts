import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Object3DAsset } from './Object3DAsset';

export class GLTFAsset extends Object3DAsset {
  private _animations: THREE.AnimationClip[];

  constructor(
    public readonly name: string,
    public readonly url: string
  ) {
    super(name);
    this._animations = [];
  }

  get animations(): THREE.AnimationClip[] {
    return this._animations;
  }

  public async load(): Promise<void> {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync(this.url);
      this._threeObject = gltf.scene;
      this._animations = gltf.animations;
      this._threeObject.name = this.name;
      this._threeObject.position.copy(this.position);
      this._threeObject.rotation.copy(this.rotation);
    } catch (error) {
      console.error('Failed to load GLTF model:', error);
      // Keep the fallback empty Object3D
    }
  }
} 