import * as THREE from 'three';
import type { IPresentableAsset } from '../types';
import type { MeshData } from './types';
import { geometryPresenters } from '../geometry/presenters';
import { materialPresenters } from '../material/presenters';

export class MeshPresenter implements IPresentableAsset {
  name: string;
  config: MeshData;

  constructor(name: string, config: MeshData) {
    this.name = name;
    this.config = config;
  }

  getPresentableAsset(): Promise<[THREE.Object3D, THREE.AnimationClip[]]> {
    return new Promise((resolve) => {
      const geometryPresenter = new geometryPresenters[this.config.geometryType](this.config.geometry);
      const materialPresenter = new materialPresenters[this.config.materialType](this.config.material);
      
      const mesh = new THREE.Mesh(geometryPresenter.getGeometry(), materialPresenter.getMaterial());
      mesh.position.set(...this.config.position);
      mesh.rotation.set(...this.config.rotation);
      mesh.name = this.name;
      
      resolve([mesh, []]);
    });
  }
} 