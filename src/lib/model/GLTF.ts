import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Object3DAsset } from './Object3DAsset';

export class GLTFAsset extends Object3DAsset {
  private _animations: THREE.AnimationClip[];

  constructor(
    public readonly name: string,
    public readonly url: string,
    public readonly emissiveTint?: number
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
      if (this.emissiveTint !== undefined) {
        // Clone each material to prevent cross-actor contamination when the same
        // GLTF URL is shared, then apply a subtle emissive tint for identification.
        const color = new THREE.Color(this.emissiveTint);
        this._threeObject.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mesh.material = Array.isArray(mesh.material)
              ? mats.map((m) => { const c = (m as THREE.MeshStandardMaterial).clone(); c.emissive = color; c.emissiveIntensity = 0.1; return c; })
              : (() => { const c = (mesh.material as THREE.MeshStandardMaterial).clone(); c.emissive = color; c.emissiveIntensity = 0.1; return c; })();
          }
        });
      }
      this._threeObject.position.copy(this._position);
      this._threeObject.rotation.copy(this._rotation);
      this._threeObject.scale.copy(this._scale);
    } catch (error) {
      console.error('Failed to load GLTF model:', error);
      // Keep the fallback empty Object3D
    }
  }
} 