import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { IPresentableAsset } from '../types';
import type { GLTFData } from './types';

export class GTLFPresenter implements IPresentableAsset {
  name: string;
  config: GLTFData;

  constructor(name: string, config: GLTFData) {
    this.name = name;
    this.config = config;
  }

  async getPresentableAsset(): Promise<[THREE.Object3D, THREE.AnimationClip[]]> {
    const loader = new GLTFLoader();
    
    return new Promise((resolve, reject) => {
      loader.load(
        this.config.url,
        (gltf) => {
          const model = gltf.scene;
          model.position.set(...this.config.position);
          model.rotation.set(...this.config.rotation);
          model.name = this.name;
          
          resolve([model, gltf.animations]);
        },
        undefined,
        (error) => {
          console.error('Error loading GLTF model:', error);
          reject(error);
        }
      );
    });
  }
} 