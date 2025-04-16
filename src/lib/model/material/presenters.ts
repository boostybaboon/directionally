import * as THREE from 'three';
import type { IPresentableMaterial, MeshStandardMaterialData } from './types';
import { MaterialType } from './types';

export class MeshStandardMaterialPresenter implements IPresentableMaterial {
  config: MeshStandardMaterialData;

  constructor(config: MeshStandardMaterialData) {
    this.config = config;
  }

  getMaterial(): THREE.Material {
    return new THREE.MeshStandardMaterial({ color: this.config.color });
  }
}

export const materialPresenters: { [key: string]: new (data: any) => IPresentableMaterial } = {
  [MaterialType.MeshStandardMaterial]: MeshStandardMaterialPresenter,
  // Add other material types and their presenters here
}; 