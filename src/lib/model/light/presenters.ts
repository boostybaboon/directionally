import * as THREE from 'three';
import type { IPresentableAsset } from '../types';
import type { DirectionalLightData, HemisphereLightData } from './types';

export class DirectionalLightPresenter implements IPresentableAsset {
  name: string;
  config: DirectionalLightData;

  constructor(name: string, config: DirectionalLightData) {
    this.name = name;
    this.config = config;
  }

  getPresentableAsset(): Promise<[THREE.Object3D, THREE.AnimationClip[]]> {
    return new Promise((resolve) => {
      const light = new THREE.DirectionalLight(this.config.color, this.config.intensity);
      light.position.set(...this.config.position);
      light.name = this.name;
      resolve([light, []]);
    });
  }
}

export class HemisphereLightPresenter implements IPresentableAsset {
  name: string;
  config: HemisphereLightData;

  constructor(name: string, config: HemisphereLightData) {
    this.name = name;
    this.config = config;
  }

  getPresentableAsset(): Promise<[THREE.Object3D, THREE.AnimationClip[]]> {
    return new Promise((resolve) => {
      const light = new THREE.HemisphereLight(this.config.skyColor, this.config.groundColor, this.config.intensity);
      light.position.set(...this.config.position);
      light.name = this.name;
      resolve([light, []]);
    });
  }  
} 